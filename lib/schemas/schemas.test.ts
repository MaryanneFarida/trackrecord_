import { describe, expect, it } from "vitest";
import { entrySchema, formatTime, parseTime, timeHundredths } from "./index";

describe("race times are exact whole hundredths", () => {
  it("parses the formats coaches type", () => {
    expect(parseTime("12.48")).toBe(1248);
    expect(parseTime("1:52.07")).toBe(11207);
    expect(parseTime("2:05:31.00")).toBe(753100);
  });
  it("refuses ambiguous or impossible times", () => {
    for (const bad of ["12.4", "12,48", "1:75.00", "abc", "", "12.483"]) expect(parseTime(bad)).toBeNull();
  });
  it("formats back the same way", () => {
    for (const t of ["12.48", "1:52.07", "2:05:31.00", "9.99"]) expect(formatTime(parseTime(t)!)).toBe(t);
  });
  it("never accepts decimals, which could hide a tiny difference", () => {
    expect(timeHundredths.safeParse(1248.5).success).toBe(false);
    expect(timeHundredths.safeParse(1248).success).toBe(true);
  });
  it("an entry must say who made it", () => {
    const base = {
      eventId: "nakuru", race: "400m", athleteId: "farida", createdBy: "martin", by: "coach",
      timeHundredths: 5812, signedAt: "2026-11-20T09:00:00.000Z", receivedAt: "2026-11-20T09:00:05.000Z",
      late: false, signedHash: "a".repeat(64),
    };
    expect(entrySchema.safeParse(base).success).toBe(true);
    const noAuthor: Partial<typeof base> = { ...base };
    delete noAuthor.createdBy;
    expect(entrySchema.safeParse(noAuthor).success).toBe(false);
  });
});
