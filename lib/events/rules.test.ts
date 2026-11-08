import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/ledger/hash";
import {
  canObject,
  canRegister,
  checkNewEvent,
  deriveTimes,
  dueForSealing,
  eventCreatePayload,
  isFresh,
  objectionPayload,
  registrationOpen,
  sealedListBody,
} from "./rules";

const H = 3600 * 1000;
const now = Date.parse("2026-11-08T09:00:00.000Z");
const raceStart = new Date(now + 48 * H).toISOString();
const event = { raceStart, ...deriveTimes(raceStart), events: ["100m", "400m"], classes: ["T12", "T44"], sealedAt: null };
const farida = { status: "verified", sportClass: "T12", events: ["400m", "800m"] };

describe("event times", () => {
  it("locks exactly 24 hours before the race and closes entry 24 hours after", () => {
    expect(deriveTimes("2026-11-10T07:00:00.000Z")).toEqual({
      lockTime: "2026-11-09T07:00:00.000Z",
      entryWindowEnd: "2026-11-11T07:00:00.000Z",
    });
  });
  it("needs at least 5 minutes of registration before the lock", () => {
    expect(checkNewEvent({ raceStart: new Date(now + 24 * H + 2 * 60_000).toISOString(), races: ["100m"], classes: ["T12"] }, now)).toBe("too_soon");
    expect(checkNewEvent({ raceStart: new Date(now + 24 * H + 10 * 60_000).toISOString(), races: ["100m"], classes: ["T12"] }, now)).toBeNull();
    expect(checkNewEvent({ raceStart, races: ["100m", "100m"], classes: ["T12"] }, now)).toBe("duplicates");
  });
  it("registration is open until the lock, then sealing is due one minute later", () => {
    const lock = Date.parse(event.lockTime);
    expect(registrationOpen(event, lock - 1)).toBe(true);
    expect(registrationOpen(event, lock)).toBe(false);
    expect(dueForSealing(event, lock + 30_000)).toBe(false);
    expect(dueForSealing(event, lock + 60_000)).toBe(true);
    expect(dueForSealing({ ...event, sealedAt: "x" }, lock + 3 * H)).toBe(false);
  });
  it("refuses signatures older than 10 minutes", () => {
    expect(isFresh(new Date(now - 9 * 60_000).toISOString(), now)).toBe(true);
    expect(isFresh(new Date(now - 11 * 60_000).toISOString(), now)).toBe(false);
  });
});

describe("automatic registration rule", () => {
  const base = { athlete: farida, event, races: ["400m"], alreadyRegistered: false, now };
  it("a verified athlete meeting the rules is in, with no approval step", () => {
    expect(canRegister(base)).toBeNull();
  });
  it("refuses with a clear reason otherwise", () => {
    expect(canRegister({ ...base, athlete: { ...farida, status: "pending" } })).toBe("athlete_not_verified");
    expect(canRegister({ ...base, athlete: null })).toBe("athlete_not_verified");
    expect(canRegister({ ...base, now: Date.parse(event.lockTime) })).toBe("registration_closed");
    expect(canRegister({ ...base, alreadyRegistered: true })).toBe("already_registered");
    expect(canRegister({ ...base, athlete: { ...farida, sportClass: "T54" } })).toBe("class_not_offered");
    expect(canRegister({ ...base, races: ["800m"] })).toBe("race_not_offered");
    expect(canRegister({ ...base, races: ["100m"] })).toBe("race_not_in_profile");
    expect(canRegister({ ...base, races: ["400m", "400m"] })).toBe("duplicates");
  });
});

describe("objections", () => {
  const base = { event, onList: true, reason: "Licence number does not match the register.", now };
  it("are allowed with a real reason until the race starts", () => {
    expect(canObject(base)).toBeNull();
    expect(canObject({ ...base, now: Date.parse(raceStart) })).toBe("race_started");
    expect(canObject({ ...base, reason: "   injured           " })).toBe("reason_too_short");
    expect(canObject({ ...base, onList: false })).toBe("not_on_list");
  });
});

describe("sealed list fingerprint", () => {
  const a = { athleteId: "b", sportClass: "T12", events: ["400m", "100m"], signedHash: "1".repeat(64) };
  const b = { athleteId: "a", sportClass: "T44", events: ["100m"], signedHash: "2".repeat(64) };
  it("does not depend on the order athletes registered in", () => {
    expect(sha256Hex(sealedListBody([a, b]))).toBe(sha256Hex(sealedListBody([b, a])));
  });
  it("changes if anyone is removed, added or changed", () => {
    const sealed = sha256Hex(sealedListBody([a, b]));
    expect(sha256Hex(sealedListBody([a]))).not.toBe(sealed);
    expect(sha256Hex(sealedListBody([a, { ...b, events: ["200m"] }]))).not.toBe(sealed);
  });
  it("ignores extra display fields such as names", () => {
    expect(sha256Hex(sealedListBody([{ ...a, fullName: "Farida" } as typeof a, b]))).toBe(sha256Hex(sealedListBody([a, b])));
  });
});

describe("signed payloads", () => {
  it("reject unknown fields, so nothing extra can ride along with a signature", () => {
    const ok = { action: "objection.create", eventId: "abcdef123", athleteId: "u1", category: "identity", reason: "x".repeat(25), at: new Date(now).toISOString() };
    expect(objectionPayload.safeParse(ok).success).toBe(true);
    expect(objectionPayload.safeParse({ ...ok, remove: true }).success).toBe(false);
  });
  it("never transform values (the server must hash exactly what was signed)", () => {
    const p = { action: "event.create", name: "  Nakuru  ", venue: "Afraha", raceStart, races: ["100m"], classes: ["T12"], at: raceStart };
    expect(eventCreatePayload.parse(p)).toEqual(p);
  });
});
