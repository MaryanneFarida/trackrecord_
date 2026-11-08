import { describe, expect, it } from "vitest";
import { athleteSecret, currentCode, hotp, makeScanToken, openScanToken, parseQr, qrText, verifyCode } from "./totp";

const master = "m".repeat(40);

describe("rotating check-in code", () => {
  it("matches the official RFC 6238 test vector", () => {
    // RFC 6238 Appendix B: secret "12345678901234567890", T = 59 s -> 94287082 (we use the last 6 digits)
    expect(hotp(Buffer.from("12345678901234567890"), 1)).toBe("287082");
  });
  it("is different for every athlete and every event", () => {
    const t = Date.parse("2026-11-10T07:00:00Z");
    const a = currentCode(athleteSecret(master, "nakuru01", "farida"), t).code;
    expect(currentCode(athleteSecret(master, "nakuru01", "zawadi"), t).code).not.toBe(a);
    expect(currentCode(athleteSecret(master, "eldoret1", "farida"), t).code).not.toBe(a);
  });
  it("accepts the current and previous code, but a screenshot older than a minute fails", () => {
    const secret = athleteSecret(master, "nakuru01", "farida");
    const t = Date.parse("2026-11-10T07:00:05Z");
    const { code } = currentCode(secret, t);
    expect(verifyCode(secret, code, t)).toBe(true);
    expect(verifyCode(secret, code, t + 30_000)).toBe(true);
    expect(verifyCode(secret, code, t + 61_000)).toBe(false);
    expect(verifyCode(secret, "12345", t)).toBe(false);
  });
  it("the QR carries no secret and parses back", () => {
    const text = qrText("nakuru01", "farida", "123456");
    expect(parseQr(text)).toEqual({ eventId: "nakuru01", athleteId: "farida", code: "123456" });
    expect(parseQr("https://evil.example")).toBeNull();
  });
});

describe("scan token", () => {
  const t = { eventId: "nakuru01", athleteId: "farida", officialId: "otieno" };
  const now = Date.parse("2026-11-10T07:00:00Z");
  it("lets the same official decide within 3 minutes", () => {
    const token = makeScanToken(master, { ...t, at: now });
    expect(openScanToken(master, token, t, now + 2 * 60_000)).toBe(true);
    expect(openScanToken(master, token, t, now + 4 * 60_000)).toBe(false);
  });
  it("can't be used by another official, for another athlete, or after tampering", () => {
    const token = makeScanToken(master, { ...t, at: now });
    expect(openScanToken(master, token, { ...t, officialId: "coachmartin" }, now)).toBe(false);
    expect(openScanToken(master, token, { ...t, athleteId: "relative" }, now)).toBe(false);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...t, athleteId: "relative", at: now })).toString("base64url");
    expect(openScanToken(master, `${forged}.${sig}`, { ...t, athleteId: "relative" }, now)).toBe(false);
    expect(openScanToken(master, `${body}.${sig}x`, t, now)).toBe(false);
  });
});
