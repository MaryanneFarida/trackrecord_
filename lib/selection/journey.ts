import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";
import { RESULTS, type ResultDoc } from "@/lib/results/server";
import { CHECKIN_STATUS } from "@/lib/checkin/summary";
import { statusId } from "@/lib/checkin/rules";
import { resultId } from "@/lib/results/rules";
import { computeFinalList, slotKey } from "./rules";
import { REMOVALS, approvedRemovals, countedResults, listSelections, type Removal, type Selection } from "./server";

export type StopState = "not_entered" | "registered" | "checked_in" | "locked" | "contested" | "decided";

export interface Stop {
  eventId: string;
  name: string;
  venue: string;
  raceStart: string;
  state: StopState;
  hundredths: number | null;
  seq: number | null;
  best: boolean;
}

export interface Journey {
  selection: Selection;
  sportClass: string;
  race: string;
  places: number;
  stops: Stop[];
  final:
    | { kind: "selected" | "reserve"; rank: number; of: number; seq: number }
    | { kind: "removed"; removal: Removal | null; seq: number }
    | { kind: "standing"; rank: number | null; of: number }; // list not generated yet
  removals: Removal[]; // open or decided removals for this athlete and race
}

/** Farida's road through every qualifier that counts, to the final list. */
export async function journeysFor(uid: string): Promise<Journey[]> {
  const db = adminDb();
  const selections = await listSelections();
  const out: Journey[] = [];
  for (const sel of selections) {
    const events = await Promise.all(sel.qualifierIds.map((id) => db.collection(EVENTS_COLLECTION).doc(id).get()));
    const entries = await Promise.all(sel.qualifierIds.map((id) => db.collection(startListPath(id)).doc(uid).get()));
    const classes = new Set(entries.filter((e) => e.exists).map((e) => e.get("sportClass") as string));
    const quotas = sel.quotas.filter((q) => classes.has(q.sportClass));
    if (quotas.length === 0) continue;

    const [counted, removed, myRemovals] = await Promise.all([
      countedResults(sel.qualifierIds),
      approvedRemovals(sel.id),
      db.collection(REMOVALS).where("selectionId", "==", sel.id).where("athleteId", "==", uid).get(),
    ]);
    const live = computeFinalList(sel.quotas, counted, removed);

    for (const q of quotas) {
      const entered = entries.some((e) => e.exists && e.get("sportClass") === q.sportClass && ((e.get("events") as string[]) ?? []).includes(q.race));
      if (!entered) continue;
      const stops: Stop[] = [];
      for (let i = 0; i < sel.qualifierIds.length; i++) {
        const ev = events[i];
        const entry = entries[i];
        const id = sel.qualifierIds[i];
        let state: StopState = "not_entered";
        let hundredths: number | null = null;
        let seq: number | null = null;
        if (entry.exists && ((entry.get("events") as string[]) ?? []).includes(q.race)) {
          const [res, chk] = await Promise.all([
            db.collection(RESULTS).doc(resultId(id, q.race, uid)).get(),
            db.collection(CHECKIN_STATUS).doc(statusId(id, uid)).get(),
          ]);
          state = chk.exists ? "checked_in" : "registered";
          if (res.exists) {
            const r = res.data() as ResultDoc;
            state = r.status;
            hundredths = r.status === "locked" ? r.hundredths : r.status === "decided" ? (r.finalHundredths ?? null) : null;
            seq = r.status === "decided" ? (r.decisionSeq ?? r.ledgerSeq) : r.ledgerSeq;
          }
        }
        stops.push({ eventId: id, name: ev.get("name") ?? "Qualifier", venue: ev.get("venue") ?? "", raceStart: ev.get("raceStart") ?? "", state, hundredths, seq, best: false });
      }
      stops.sort((a, b) => a.raceStart.localeCompare(b.raceStart));
      const timed = stops.filter((s) => s.hundredths !== null);
      if (timed.length) timed.reduce((a, b) => (b.hundredths! < a.hundredths! ? b : a)).best = true;

      const removals = myRemovals.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Removal, "id">) }))
        .filter((r) => r.race === q.race && r.sportClass === q.sportClass)
        .sort((a, b) => a.proposedAt.localeCompare(b.proposedAt));

      let final: Journey["final"];
      const finalQuota = sel.finalList?.find((x) => x.sportClass === q.sportClass && x.race === q.race);
      if (finalQuota && sel.finalListSeq) {
        const me = finalQuota.ranking.find((r) => r.athleteId === uid);
        if (removed.has(slotKey(uid, q.sportClass, q.race))) final = { kind: "removed", removal: removals.find((r) => r.status === "approved") ?? null, seq: sel.finalListSeq };
        else if (me) final = { kind: me.status, rank: me.rank, of: finalQuota.ranking.length, seq: sel.finalListSeq };
        else final = { kind: "standing", rank: null, of: finalQuota.ranking.length };
      } else {
        const lq = live.find((x) => x.sportClass === q.sportClass && x.race === q.race);
        const me = lq?.ranking.find((r) => r.athleteId === uid);
        final = { kind: "standing", rank: me?.rank ?? null, of: lq?.ranking.length ?? 0 };
      }
      out.push({ selection: sel, sportClass: q.sportClass, race: q.race, places: q.places, stops, final, removals });
    }
  }
  return out;
}
