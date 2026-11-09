import { describe, expect, it } from "vitest";
import { canReview, computeFinalList, publishPayload, proposePayload, readiness, slotKey, type CountedResult } from "./rules";

const r = (athleteId: string, hundredths: number, ledgerSeq: number, eventId = "q1", sportClass = "T12"): CountedResult => ({
  eventId, race: "400m", athleteId, sportClass, hundredths, source: "locked", ledgerSeq,
});
const quota = [{ sportClass: "T12", race: "400m" as const, places: 2 }];

describe("final list", () => {
  it("ranks by each athlete's best time across qualifiers", () => {
    const [q] = computeFinalList(quota, [r("farida", 5400, 1), r("farida", 5231, 5, "q2"), r("zawadi", 5300, 2), r("amina", 5500, 3)], new Set());
    expect(q.ranking.map((x) => [x.athleteId, x.best, x.status])).toEqual([
      ["farida", 5231, "selected"],
      ["zawadi", 5300, "selected"],
      ["amina", 5500, "reserve"],
    ]);
    expect(q.ranking[0].count).toBe(2);
  });
  it("ties are broken by the second-best time, then by the earlier record", () => {
    const [q] = computeFinalList(quota, [r("a", 5000, 9), r("b", 5000, 1), r("b", 5600, 2), r("a", 5100, 10)], new Set());
    expect(q.ranking.map((x) => x.athleteId)).toEqual(["a", "b"]);
  });
  it("an approved removal takes the athlete out and the next one moves up automatically", () => {
    const results = [r("farida", 5231, 1), r("zawadi", 5300, 2), r("amina", 5500, 3)];
    const [q] = computeFinalList(quota, results, new Set([slotKey("farida", "T12", "400m")]));
    expect(q.ranking.map((x) => [x.athleteId, x.status])).toEqual([["zawadi", "selected"], ["amina", "selected"]]);
    expect(q.removed).toEqual(["farida"]);
  });
  it("only counts results in the quota's class (no racing in an easier class)", () => {
    const [q] = computeFinalList(quota, [r("farida", 5231, 1), r("relative", 4000, 2, "q1", "T13")], new Set());
    expect(q.ranking.map((x) => x.athleteId)).toEqual(["farida"]);
  });
  it("is deterministic: same input, same list", () => {
    const results = [r("x", 5100, 3), r("y", 5200, 1), r("z", 5000, 2)];
    expect(computeFinalList(quota, results, new Set())).toEqual(computeFinalList(quota, [...results].reverse(), new Set()));
  });
});

describe("when the list can be generated", () => {
  const ok = { eventId: "q1", name: "Nakuru", sealed: true, entryClosed: false, athleteRaces: 3, notCheckedIn: 0, decided: 3, contestedOpen: 0 };
  it("only once every result is in and no contested result is waiting", () => {
    expect(readiness([ok]).ready).toBe(true);
    expect(readiness([{ ...ok, decided: 2 }]).ready).toBe(false);
    expect(readiness([{ ...ok, contestedOpen: 1, decided: 2 }]).blockers[0]).toContain("tribunal");
    expect(readiness([{ ...ok, sealed: false }]).ready).toBe(false);
    expect(readiness([{ ...ok, notCheckedIn: 1 }]).ready).toBe(false);
  });
  it("after the entry window closes, missing results no longer block (but contested ones still do)", () => {
    expect(readiness([{ ...ok, entryClosed: true, decided: 1, notCheckedIn: 1 }]).ready).toBe(true);
    expect(readiness([{ ...ok, entryClosed: true, contestedOpen: 1 }]).ready).toBe(false);
  });
});

describe("removals", () => {
  const base = { status: "proposed", ground: "eligibility", respondBy: "2026-11-12T00:00:00.000Z", response: null };
  const now = Date.parse("2026-11-10T00:00:00.000Z");
  it("the tribunal must wait for the athlete's response or the end of the window", () => {
    expect(canReview(base, now)).toBe("waiting_for_athlete");
    expect(canReview({ ...base, response: "I hold a valid licence" }, now)).toBeNull();
    expect(canReview(base, Date.parse(base.respondBy))).toBeNull();
  });
  it("an ADAK doping suspension can be reviewed at once; a decided removal can't be reviewed again", () => {
    expect(canReview({ ...base, ground: "doping" }, now)).toBeNull();
    expect(canReview({ ...base, status: "approved" }, now)).toBe("already_reviewed");
  });
  it("only reasons on the fixed list are accepted: no 'coach decision', no 'other', no medical without a doctor", () => {
    const p = { action: "removal.propose", selectionId: "sel123", athleteId: "farida", sportClass: "T12", race: "400m", ground: "eligibility", evidenceRef: "LIC-22", note: "x".repeat(25), at: "2026-11-10T00:00:00.000Z" };
    expect(proposePayload.safeParse(p).success).toBe(true);
    for (const ground of ["coach_decision", "other", "injury", "medical", "voluntary"]) expect(proposePayload.safeParse({ ...p, ground }).success).toBe(false);
  });
  it("rules can't carry extra fields", () => {
    const p = { action: "selection.publish", name: "Team 2027", qualifierIds: ["qualifier1"], quotas: [{ sportClass: "T12", race: "400m", places: 3 }], at: "2026-11-10T00:00:00.000Z" };
    expect(publishPayload.safeParse(p).success).toBe(true);
    expect(publishPayload.safeParse({ ...p, extraNames: ["relative"] }).success).toBe(false);
  });
});
