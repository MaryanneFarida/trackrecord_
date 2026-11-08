import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ledgerAppend } from "@/lib/ledger/server";
import { decide, entryId, resultId } from "./rules";

export const ENTRIES = "entries";
export const RESULTS = "results";

class AlreadyDone extends Error {}

export interface ResultDoc {
  eventId: string;
  race: string;
  athleteId: string;
  status: "locked" | "contested";
  hundredths: number | null; // the agreed time if locked
  coachHundredths: number;
  athleteHundredths: number;
  coachId: string;
  ledgerSeq: number;
  decidedAt: string;
}

/**
 * Called after each entry. Once both sides have entered, writes ONE ledger
 * record (locked or contested) and the result, in the same transaction.
 * Safe to call many times: it only ever decides once.
 */
export async function finalizeResult(eventId: string, race: string, athleteId: string) {
  const db = adminDb();
  const [c, a] = await Promise.all([
    db.collection(ENTRIES).doc(entryId(eventId, race, athleteId, "coach")).get(),
    db.collection(ENTRIES).doc(entryId(eventId, race, athleteId, "athlete")).get(),
  ]);
  if (!c.exists || !a.exists) return null;
  const coach = c.data() as { hundredths: number; createdBy: string; signedHash: string };
  const athlete = a.data() as { hundredths: number; signedHash: string };
  const type = decide(coach.hundredths, athlete.hundredths);
  const ref = db.collection(RESULTS).doc(resultId(eventId, race, athleteId));
  const payload =
    type === "RESULT_LOCKED"
      ? { eventId, race, athleteId, hundredths: coach.hundredths, coachId: coach.createdBy, coachEntryHash: coach.signedHash, athleteEntryHash: athlete.signedHash }
      : { eventId, race, athleteId, coachHundredths: coach.hundredths, athleteHundredths: athlete.hundredths, coachId: coach.createdBy, coachEntryHash: coach.signedHash, athleteEntryHash: athlete.signedHash };
  try {
    const rec = await ledgerAppend(type, payload, async (tx, r) => {
      if ((await tx.get(ref)).exists) throw new AlreadyDone();
      const doc: ResultDoc = {
        eventId,
        race,
        athleteId,
        status: type === "RESULT_LOCKED" ? "locked" : "contested",
        hundredths: type === "RESULT_LOCKED" ? coach.hundredths : null,
        coachHundredths: coach.hundredths,
        athleteHundredths: athlete.hundredths,
        coachId: coach.createdBy,
        ledgerSeq: r.seq,
        decidedAt: r.createdAt,
      };
      tx.create(ref, doc);
    });
    return { type, seq: rec.seq, coachId: coach.createdBy };
  } catch (err) {
    if (err instanceof AlreadyDone) return null;
    throw err;
  }
}

export async function resultsFor(eventId: string): Promise<ResultDoc[]> {
  const snap = await adminDb().collection(RESULTS).where("eventId", "==", eventId).get();
  return snap.docs.map((d) => d.data() as ResultDoc);
}

export async function entriesBy(uid: string, eventId: string) {
  const snap = await adminDb().collection(ENTRIES).where("createdBy", "==", uid).where("eventId", "==", eventId).get();
  return snap.docs.map((d) => d.data() as { race: string; athleteId: string; side: string; hundredths: number });
}

export async function coachEntriesFor(eventId: string) {
  const snap = await adminDb().collection(ENTRIES).where("eventId", "==", eventId).where("side", "==", "coach").get();
  return snap.docs.map((d) => d.data() as { race: string; athleteId: string; createdBy: string; hundredths: number });
}
