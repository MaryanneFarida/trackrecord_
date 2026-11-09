import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ledgerAppend } from "@/lib/ledger/server";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";
import { RESULTS, type ResultDoc } from "@/lib/results/server";
import { CHECKIN_STATUS } from "@/lib/checkin/summary";
import { computeFinalList, slotKey, type CountedResult, type Quota, type QualifierState, type QuotaList } from "./rules";

export const SELECTIONS = "selectionRules";
export const REMOVALS = "removals";

export interface Selection {
  id: string;
  name: string;
  qualifierIds: string[];
  quotas: Quota[];
  createdAt: string;
  ledgerSeq: number;
  finalVersion: number; // 0 = not generated yet
  finalListSeq: number | null;
  finalList: QuotaList[] | null;
  generatedAt: string | null;
}

export interface Removal {
  id: string;
  selectionId: string;
  athleteId: string;
  sportClass: string;
  race: string;
  ground: string;
  evidenceRef: string;
  note: string;
  status: "proposed" | "approved" | "rejected";
  proposedAt: string;
  respondBy: string;
  response: string | null;
  respondedAt?: string;
  reviewReason?: string;
  reviewedAt?: string;
  ledgerSeq: number;
  responseSeq?: number;
  reviewSeq?: number;
}

const toSelection = (id: string, d: FirebaseFirestore.DocumentData): Selection => ({
  id,
  name: d.name,
  qualifierIds: d.qualifierIds,
  quotas: d.quotas,
  createdAt: d.createdAt,
  ledgerSeq: d.ledgerSeq,
  finalVersion: d.finalVersion ?? 0,
  finalListSeq: d.finalListSeq ?? null,
  finalList: d.finalList ?? null,
  generatedAt: d.generatedAt ?? null,
});

export async function listSelections(): Promise<Selection[]> {
  const snap = await adminDb().collection(SELECTIONS).orderBy("createdAt", "desc").limit(20).get();
  return snap.docs.map((d) => toSelection(d.id, d.data()));
}

export async function getSelection(id: string): Promise<Selection | null> {
  const d = await adminDb().collection(SELECTIONS).doc(id).get();
  return d.exists ? toSelection(d.id, d.data()!) : null;
}

export async function removalsFor(selectionId: string): Promise<Removal[]> {
  const snap = await adminDb().collection(REMOVALS).where("selectionId", "==", selectionId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Removal, "id">) })).sort((a, b) => a.proposedAt.localeCompare(b.proposedAt));
}

/** Every result that counts: locked, or decided by the tribunal. Class = the class raced in at that qualifier. */
export async function countedResults(qualifierIds: string[]): Promise<CountedResult[]> {
  if (qualifierIds.length === 0) return [];
  const db = adminDb();
  const [results, ...lists] = await Promise.all([
    db.collection(RESULTS).where("eventId", "in", qualifierIds).get(),
    ...qualifierIds.map((id) => db.collection(startListPath(id)).get()),
  ]);
  const classOf = new Map<string, string>();
  lists.forEach((snap, i) => snap.docs.forEach((d) => classOf.set(`${qualifierIds[i]}|${d.id}`, d.get("sportClass"))));
  const out: CountedResult[] = [];
  for (const doc of results.docs) {
    const r = doc.data() as ResultDoc;
    const sportClass = classOf.get(`${r.eventId}|${r.athleteId}`);
    if (!sportClass) continue;
    if (r.status === "locked" && r.hundredths !== null) out.push({ ...pick(r), sportClass, hundredths: r.hundredths, source: "locked", ledgerSeq: r.ledgerSeq });
    if (r.status === "decided" && r.finalHundredths) out.push({ ...pick(r), sportClass, hundredths: r.finalHundredths, source: "tribunal", ledgerSeq: r.decisionSeq ?? r.ledgerSeq });
  }
  return out;
}
const pick = (r: ResultDoc) => ({ eventId: r.eventId, race: r.race, athleteId: r.athleteId });

export async function approvedRemovals(selectionId: string): Promise<Set<string>> {
  const snap = await adminDb().collection(REMOVALS).where("selectionId", "==", selectionId).where("status", "==", "approved").get();
  return new Set(snap.docs.map((d) => slotKey(d.get("athleteId"), d.get("sportClass"), d.get("race"))));
}

/** The state of each qualifier, to decide whether the list may be generated. */
export async function qualifierStates(qualifierIds: string[]): Promise<QualifierState[]> {
  const db = adminDb();
  const now = Date.now();
  return Promise.all(
    qualifierIds.map(async (id) => {
      const [ev, list, checked, results] = await Promise.all([
        db.collection(EVENTS_COLLECTION).doc(id).get(),
        db.collection(startListPath(id)).get(),
        db.collection(CHECKIN_STATUS).where("eventId", "==", id).get(),
        db.collection(RESULTS).where("eventId", "==", id).get(),
      ]);
      const statuses = results.docs.map((d) => d.get("status") as string);
      return {
        eventId: id,
        name: ev.get("name") ?? id,
        sealed: Boolean(ev.get("sealedAt")),
        entryClosed: ev.exists && now >= Date.parse(ev.get("entryWindowEnd")),
        athleteRaces: list.docs.reduce((n, d) => n + ((d.get("events") as string[]) ?? []).length, 0),
        notCheckedIn: list.size - checked.size,
        decided: statuses.filter((s) => s === "locked" || s === "decided").length,
        contestedOpen: statuses.filter((s) => s === "contested").length,
      };
    }),
  );
}

class Stale extends Error {}

/**
 * Computes the list from the published rules and writes it as the next
 * FINAL_LIST ledger record. Version 1 is generated by the admin; later versions
 * only follow an approved removal or withdrawal, and say which one.
 */
export async function writeFinalList(selectionId: string, expectedVersion: number, cause: { by: string; removalId?: string; removalSeq?: number }) {
  const db = adminDb();
  const sel = await getSelection(selectionId);
  if (!sel) throw new Error("not_found");
  const [results, removed] = await Promise.all([countedResults(sel.qualifierIds), approvedRemovals(selectionId)]);
  const lists = computeFinalList(sel.quotas, results, removed);
  const version = expectedVersion + 1;
  const ref = db.collection(SELECTIONS).doc(selectionId);
  try {
    const rec = await ledgerAppend(
      "FINAL_LIST",
      {
        selectionId,
        version,
        cause,
        quotas: lists.map((q) => ({
          sportClass: q.sportClass,
          race: q.race,
          places: q.places,
          selected: q.ranking.filter((r) => r.status === "selected").map((r) => ({ athleteId: r.athleteId, best: r.best, rank: r.rank })),
          reserves: q.ranking.filter((r) => r.status === "reserve").map((r) => ({ athleteId: r.athleteId, best: r.best, rank: r.rank })),
          removed: q.removed,
        })),
      },
      async (tx, r) => {
        const fresh = await tx.get(ref);
        if ((fresh.get("finalVersion") ?? 0) !== expectedVersion) throw new Stale();
        tx.update(ref, { finalVersion: version, finalListSeq: r.seq, finalList: lists, generatedAt: r.createdAt });
      },
    );
    return { version, seq: rec.seq, lists };
  } catch (err) {
    if (err instanceof Stale) return null;
    throw err;
  }
}

export async function athleteNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const docs = await adminDb().getAll(...unique.map((id) => adminDb().collection("athletes").doc(id)));
  return new Map(docs.map((d) => [d.id, (d.get("fullName") as string) ?? "Athlete"]));
}
