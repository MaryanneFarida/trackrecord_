import type { Firestore } from "firebase-admin/firestore";
import { appendRecord, type Signer } from "@/lib/ledger/store";
import { sha256Hex } from "@/lib/ledger/hash";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";
import { dueForCheckInSummary, summarise, type CheckInAttempt } from "./rules";

export const CHECKINS = "checkIns"; // one document per attempt (refusals are kept too)
export const CHECKIN_STATUS = "checkInStatus"; // one per athlete per event, created only on success

class AlreadyDone extends Error {}

/**
 * When check-in closes, writes one CHECKIN_SUMMARY ledger record: who checked
 * in, who was refused at the face check, who didn't show, plus the fingerprints
 * of every signed attempt. Same once-only transaction pattern as sealing.
 */
export async function closeCheckIn(db: Firestore, signer: Signer, eventId: string, now = Date.now()) {
  const eventRef = db.collection(EVENTS_COLLECTION).doc(eventId);
  const ev = await eventRef.get();
  if (!ev.exists || !dueForCheckInSummary(ev.data() as { sealedAt: string; raceStart: string; checkInSummarySeq?: number }, now)) return { closed: false };

  const [list, attempts] = await Promise.all([
    db.collection(startListPath(eventId)).get(),
    db.collection(CHECKINS).where("eventId", "==", eventId).get(),
  ]);
  const summary = summarise(
    list.docs.map((d) => d.id),
    attempts.docs.map((d) => d.data() as CheckInAttempt),
  );
  const payload = {
    eventId,
    checkedIn: summary.checkedIn,
    refusedFace: summary.refusedFace,
    noShow: summary.noShow,
    attempts: summary.attemptHashes.length,
    attemptsHash: sha256Hex(summary.attemptHashes),
  };
  try {
    const rec = await appendRecord(db, signer, "CHECKIN_SUMMARY", payload, async (tx, r) => {
      const fresh = await tx.get(eventRef);
      if (fresh.get("checkInSummarySeq")) throw new AlreadyDone();
      tx.update(eventRef, { checkInSummarySeq: r.seq, checkInClosedAt: r.createdAt });
    });
    return { closed: true, seq: rec.seq };
  } catch (err) {
    if (err instanceof AlreadyDone) return { closed: false };
    throw err;
  }
}
