import { describe, expect, it } from "vitest";
import { checkInOpen, checkInPayload, dueForCheckInSummary, summarise } from "./rules";

const H = 3600 * 1000;
const raceStart = "2026-11-10T07:00:00.000Z";
const race = Date.parse(raceStart);

describe("check-in window", () => {
  it("opens only once the list is sealed and closes 8 hours after the first race", () => {
    expect(checkInOpen({ sealedAt: null, raceStart }, race - 2 * H)).toBe(false);
    expect(checkInOpen({ sealedAt: "x", raceStart }, race - 2 * H)).toBe(true);
    expect(checkInOpen({ sealedAt: "x", raceStart }, race + 8 * H)).toBe(false);
  });
  it("the summary is due once, after check-in closes", () => {
    expect(dueForCheckInSummary({ sealedAt: "x", raceStart }, race + 7 * H)).toBe(false);
    expect(dueForCheckInSummary({ sealedAt: "x", raceStart }, race + 8 * H)).toBe(true);
    expect(dueForCheckInSummary({ sealedAt: "x", raceStart, checkInSummarySeq: 9 }, race + 9 * H)).toBe(false);
  });
});

describe("check-in summary", () => {
  it("lists who checked in, who was refused and who didn't show", () => {
    const s = summarise(["farida", "zawadi", "amina", "joy"], [
      { athleteId: "farida", outcome: "checked_in", signedHash: "b" },
      { athleteId: "zawadi", outcome: "refused_face", signedHash: "a" },
      { athleteId: "amina", outcome: "refused_face", signedHash: "d" },
      { athleteId: "amina", outcome: "checked_in", signedHash: "c" }, // refused, then a second official checked her in
    ]);
    expect(s).toEqual({ checkedIn: ["amina", "farida"], refusedFace: ["zawadi"], noShow: ["joy"], attemptHashes: ["a", "b", "c", "d"] });
  });
});

describe("signed check-in decision", () => {
  it("rejects extra fields and unknown outcomes", () => {
    const ok = { action: "checkin.decide", eventId: "nakuru01", athleteId: "farida", outcome: "checked_in", guideName: "", scanToken: "x".repeat(20), at: raceStart };
    expect(checkInPayload.safeParse(ok).success).toBe(true);
    expect(checkInPayload.safeParse({ ...ok, outcome: "removed" }).success).toBe(false);
    expect(checkInPayload.safeParse({ ...ok, athleteId2: "x" }).success).toBe(false);
  });
});
