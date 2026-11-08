import { describe, expect, it } from "vitest";
import { canEnter, decide, entryId, resultPayload } from "./rules";

const base = {
  side: "coach" as const,
  sessionUid: "martin",
  athleteId: "farida",
  onList: true,
  racesEntered: ["400m"],
  race: "400m",
  checkedIn: true,
  entryWindowEnd: "2026-11-11T07:00:00.000Z",
  now: Date.parse("2026-11-10T09:00:00.000Z"),
};

describe("entering results", () => {
  it("coach and athlete can each enter a time for a checked-in athlete", () => {
    expect(canEnter(base)).toBeNull();
    expect(canEnter({ ...base, side: "athlete", sessionUid: "farida" })).toBeNull();
  });
  it("refuses in every other case", () => {
    expect(canEnter({ ...base, side: "athlete", sessionUid: "zawadi" })).toBe("not_your_result");
    expect(canEnter({ ...base, race: "800m" })).toBe("not_in_race");
    expect(canEnter({ ...base, onList: false })).toBe("not_in_race");
    expect(canEnter({ ...base, checkedIn: false })).toBe("not_checked_in");
    expect(canEnter({ ...base, now: Date.parse(base.entryWindowEnd) })).toBe("entry_closed");
  });
  it("locks only on an exact match, to the hundredth", () => {
    expect(decide(5231, 5231)).toBe("RESULT_LOCKED");
    expect(decide(5231, 5230)).toBe("RESULT_CONTESTED");
  });
  it("coach and athlete entries are separate documents, so neither can overwrite the other", () => {
    expect(entryId("nakuru01", "400m", "farida", "coach")).not.toBe(entryId("nakuru01", "400m", "farida", "athlete"));
  });
  it("the signed time is a whole number of hundredths", () => {
    const p = { action: "result.enter", eventId: "nakuru01", race: "400m", athleteId: "farida", hundredths: 5231, at: base.entryWindowEnd };
    expect(resultPayload.safeParse(p).success).toBe(true);
    expect(resultPayload.safeParse({ ...p, hundredths: 52.31 }).success).toBe(false);
    expect(resultPayload.safeParse({ ...p, race: "60m" }).success).toBe(false);
  });
});
