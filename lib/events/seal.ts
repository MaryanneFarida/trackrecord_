import type { Firestore } from "firebase-admin/firestore";
import { appendRecord, type Signer } from "@/lib/ledger/store";
import { sha256Hex } from "@/lib/ledger/hash";
import { dueForSealing, sealedListBody, type EventRules, type SealedEntry } from "./rules";

export const EVENTS_COLLECTION = "events";
export const startListPath = (eventId: string) => `startLists/${eventId}/athletes`;

class AlreadySealed extends Error {}

export interface SealResult {
  sealed: boolean; // true if this call did the sealing
  sealedSeq: number | null;
  listHash: string | null;
}

/**
 * Seals a start list once its lock time has passed: fingerprints the whole list
 * and writes a STARTLIST_SEALED ledger record. Marking the event as sealed
 * happens in the SAME transaction as the ledger record, so two pages loading
 * at once can never seal twice, and there can never be a seal without a record.
 * Takes the database as a parameter so emulator tests run the real code.
 */
export async function sealStartList(db: Firestore, signer: Signer, eventId: string, now = Date.now()): Promise<SealResult> {
  const eventRef = db.collection(EVENTS_COLLECTION).doc(eventId);
  const ev = await eventRef.get();
  if (!ev.exists) throw new Error("event_not_found");
  const data = ev.data() as EventRules & { sealedSeq?: number; listHash?: string };
  if (!dueForSealing(data, now)) return { sealed: false, sealedSeq: data.sealedSeq ?? null, listHash: data.listHash ?? null };

  const snap = await db.collection(startListPath(eventId)).get();
  const body = sealedListBody(snap.docs.map((d) => d.data() as SealedEntry));
  const listHash = sha256Hex(body);
  try {
    const record = await appendRecord(
      db,
      signer,
      "STARTLIST_SEALED",
      { eventId, count: body.length, listHash, athleteIds: body.map((e) => e.athleteId) },
      async (tx, rec) => {
        const fresh = await tx.get(eventRef);
        if (fresh.get("sealedAt")) throw new AlreadySealed();
        tx.update(eventRef, { sealedAt: rec.createdAt, sealedSeq: rec.seq, listHash, count: body.length });
      },
    );
    return { sealed: true, sealedSeq: record.seq, listHash };
  } catch (err) {
    if (!(err instanceof AlreadySealed)) throw err;
    const again = await eventRef.get();
    return { sealed: false, sealedSeq: again.get("sealedSeq") ?? null, listHash: again.get("listHash") ?? null };
  }
}

/** Recomputes the fingerprint of a stored list, to compare with the sealed one. */
export async function currentListHash(db: Firestore, eventId: string) {
  const snap = await db.collection(startListPath(eventId)).get();
  return sha256Hex(sealedListBody(snap.docs.map((d) => d.data() as SealedEntry)));
}
