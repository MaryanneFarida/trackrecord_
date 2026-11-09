import { z } from "zod";
import { EVENTS, SPORT_CLASSES } from "@/lib/athletes/schema";
import { timeHundredths } from "@/lib/schemas";

/**
 * Selection: how the final list is made, and the ONLY ways anyone can leave it.
 * Pure functions, so every rule is unit-tested.
 *
 *  1. The admin publishes selection rules (which qualifiers count, how many places
 *     per class and race) BEFORE results lock. Published rules never change.
 *  2. The final list is generated from those rules: best locked (or tribunal-decided)
 *     time per athlete, fastest first. Nobody types names onto it.
 *  3. Removal only for a reason on a fixed list, with evidence, after the athlete
 *     has been told and could respond, and only once an independent tribunal member
 *     co-signs it. The next athlete moves up automatically.
 */

const classCodes = SPORT_CLASSES.map((c) => c.code) as [string, ...string[]];
const eventId = z.string().regex(/^[A-Za-z0-9_-]{6,40}$/);
const selectionId = z.string().regex(/^[A-Za-z0-9_-]{6,40}$/);
const iso = z.string().datetime();

export const quotaSchema = z
  .object({ sportClass: z.enum(classCodes), race: z.enum(EVENTS), places: z.number().int().min(1).max(20) })
  .strict();
export type Quota = z.infer<typeof quotaSchema>;

export const publishPayload = z
  .object({
    action: z.literal("selection.publish"),
    name: z.string().min(3).max(100),
    qualifierIds: z.array(eventId).min(1).max(10),
    quotas: z.array(quotaSchema).min(1).max(40),
    at: iso,
  })
  .strict();

export const generatePayload = z.object({ action: z.literal("selection.generate"), selectionId, at: iso }).strict();

export const REMOVAL_GROUNDS = [
  { code: "doping", label: "Doping: ADAK suspension", evidence: "ADAK case reference", enabled: true, immediate: true },
  { code: "classification", label: "Classification changed by the panel", evidence: "Classification panel reference", enabled: true, immediate: false },
  { code: "eligibility", label: "Eligibility (licence or nationality)", evidence: "Document reference", enabled: true, immediate: false },
  { code: "medical", label: "Medical unfitness (needs a doctor's signed report: coming soon)", evidence: "Doctor's report", enabled: false, immediate: false },
] as const;
const groundCodes = REMOVAL_GROUNDS.filter((g) => g.enabled).map((g) => g.code) as [string, ...string[]];
export const groundLabel = (code: string) =>
  code === "voluntary" ? "Withdrew voluntarily (signed by the athlete)" : (REMOVAL_GROUNDS.find((g) => g.code === code)?.label ?? code);
export const groundIsImmediate = (code: string) => REMOVAL_GROUNDS.find((g) => g.code === code)?.immediate === true;

const slot = { selectionId, athleteId: z.string().min(1).max(128), sportClass: z.enum(classCodes), race: z.enum(EVENTS) };

export const proposePayload = z
  .object({ action: z.literal("removal.propose"), ...slot, ground: z.enum(groundCodes), evidenceRef: z.string().max(120), note: z.string().max(1000), at: iso })
  .strict();
export const withdrawPayload = z.object({ action: z.literal("removal.withdraw"), ...slot, at: iso }).strict();
export const respondPayload = z.object({ action: z.literal("removal.respond"), removalId: z.string().min(1).max(60), response: z.string().max(1000), at: iso }).strict();
export const reviewPayload = z
  .object({ action: z.literal("removal.review"), removalId: z.string().min(1).max(60), decision: z.enum(["approve", "reject"]), reason: z.string().max(1000), at: iso })
  .strict();
export const decidePayload = z
  .object({ action: z.literal("result.decide"), eventId, race: z.enum(EVENTS), athleteId: z.string().min(1).max(128), hundredths: timeHundredths, reason: z.string().max(1000), at: iso })
  .strict();

export const slotKey = (athleteId: string, sportClass: string, race: string) => `${athleteId}|${sportClass}|${race}`;
export const quotaKey = (sportClass: string, race: string) => `${sportClass}|${race}`;

/** The tribunal may review once the athlete has answered or the response window has passed. Doping suspensions apply at once (the law requires it). */
export function canReview(r: { status: string; ground: string; respondBy: string; response: string | null }, now: number): string | null {
  if (r.status !== "proposed") return "already_reviewed";
  if (groundIsImmediate(r.ground) || r.response !== null || now >= Date.parse(r.respondBy)) return null;
  return "waiting_for_athlete";
}

// ---------- Standings and the final list ----------

export interface CountedResult {
  eventId: string;
  race: string;
  athleteId: string;
  sportClass: string; // the class the athlete raced in at that qualifier
  hundredths: number;
  source: "locked" | "tribunal";
  ledgerSeq: number;
}

export interface Ranked {
  athleteId: string;
  best: number;
  bestSeq: number; // the ledger record of the best result, for the proof link
  count: number;
  rank: number;
  status: "selected" | "reserve";
}

export interface QuotaList extends Quota {
  ranking: Ranked[];
  removed: string[]; // athleteIds removed from this quota (approved removals and withdrawals)
}

/**
 * Best time per athlete (fastest first). Ties: the better second-best time wins,
 * then the earlier record. The same input always gives the same list, so anyone
 * can recompute it from the public ledger and check.
 */
export function computeFinalList(quotas: Quota[], results: CountedResult[], removed: Set<string>): QuotaList[] {
  return quotas.map((q) => {
    const mine = results.filter((r) => r.sportClass === q.sportClass && r.race === q.race);
    const byAthlete = new Map<string, CountedResult[]>();
    for (const r of mine) byAthlete.set(r.athleteId, [...(byAthlete.get(r.athleteId) ?? []), r]);
    const removedHere = [...byAthlete.keys()].filter((id) => removed.has(slotKey(id, q.sportClass, q.race))).sort();
    const rows = [...byAthlete.entries()]
      .filter(([id]) => !removed.has(slotKey(id, q.sportClass, q.race)))
      .map(([athleteId, rs]) => {
        const sorted = [...rs].sort((a, b) => a.hundredths - b.hundredths || a.ledgerSeq - b.ledgerSeq);
        return { athleteId, best: sorted[0].hundredths, second: sorted[1]?.hundredths ?? Infinity, bestSeq: sorted[0].ledgerSeq, count: rs.length };
      })
      .sort((a, b) => a.best - b.best || a.second - b.second || a.bestSeq - b.bestSeq);
    const ranking: Ranked[] = rows.map((r, i) => ({
      athleteId: r.athleteId,
      best: r.best,
      bestSeq: r.bestSeq,
      count: r.count,
      rank: i + 1,
      status: i < q.places ? "selected" : "reserve",
    }));
    return { ...q, ranking, removed: removedHere };
  });
}

/** Can the list be generated yet? Never while someone's result is still open, so nobody is cut by timing. */
export interface QualifierState {
  eventId: string;
  name: string;
  sealed: boolean;
  entryClosed: boolean; // 24 h after the race
  athleteRaces: number; // start-list athlete x race pairs
  notCheckedIn: number;
  decided: number; // locked or tribunal-decided
  contestedOpen: number;
}

export function readiness(states: QualifierState[]): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const s of states) {
    if (!s.sealed) blockers.push(`${s.name}: start list not sealed yet`);
    else if (s.contestedOpen > 0) blockers.push(`${s.name}: ${s.contestedOpen} contested result(s) waiting for the tribunal`);
    else if (!s.entryClosed && (s.notCheckedIn > 0 || s.decided < s.athleteRaces)) {
      blockers.push(`${s.name}: ${s.athleteRaces - s.decided} result(s) still open`);
    }
  }
  return { ready: blockers.length === 0, blockers };
}

export const SELECTION_MESSAGES: Record<string, string> = {
  results_already_locked: "One of these qualifiers already has locked results. Rules must be published before results count.",
  unknown_qualifier: "One of the chosen qualifiers doesn't exist.",
  duplicate_quota: "The same class and race appear twice.",
  not_ready: "The list can't be generated yet: some results are still open.",
  already_generated: "The final list has already been generated. It only changes through approved removals.",
  not_on_list: "That athlete isn't on this final list for that class and race.",
  evidence_required: "Enter the evidence reference (at least 3 characters).",
  note_too_short: "Explain the removal in at least 20 characters. The athlete and the public will read it.",
  already_proposed: "There is already an open removal for this athlete in this race.",
  waiting_for_athlete: "The athlete still has time to respond. Review after they answer or the window closes.",
  already_reviewed: "This removal has already been reviewed.",
  reason_too_short: "Give a reason of at least 20 characters. It will be public.",
  response_too_short: "Write at least 10 characters.",
  already_answered: "You have already responded.",
  not_contested: "That result isn't waiting for a tribunal decision.",
  list_not_generated: "The final list hasn't been generated yet.",
};
