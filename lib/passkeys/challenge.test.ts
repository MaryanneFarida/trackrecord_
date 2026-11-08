import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newChallenge, openChallenge, sealChallenge } from "./challenge";
import { relyingPartyFrom } from "./rp";

const key = randomBytes(32).toString("hex");
const now = 1_800_000_000;
const action = "ab".repeat(32);

describe("passkey challenge cookie", () => {
  it("opens for the right user and purpose", () => {
    const c = newChallenge("u1", "authenticate", action, now);
    const opened = openChallenge(sealChallenge(c, key), key, { uid: "u1", purpose: "authenticate" }, now + 10);
    expect(opened?.challenge).toBe(c.challenge);
    expect(opened?.actionHash).toBe(action);
  });
  it("binds the action hash into the challenge itself", () => {
    const c = newChallenge("u1", "authenticate", action, now);
    expect(Buffer.from(c.challenge, "base64url").subarray(16).toString("hex")).toBe(action);
  });
  it("refuses a tampered cookie", () => {
    const sealed = sealChallenge(newChallenge("u1", "register", null, now), key);
    const forged = sealChallenge({ ...newChallenge("u1", "register", null, now), uid: "u2" }, randomBytes(32).toString("hex"));
    expect(openChallenge(sealed.slice(0, -2) + "xx", key, { uid: "u1", purpose: "register" }, now)).toBeNull();
    expect(openChallenge(forged, key, { uid: "u2", purpose: "register" }, now)).toBeNull();
  });
  it("refuses another user, another purpose, or an expired challenge", () => {
    const sealed = sealChallenge(newChallenge("u1", "register", null, now), key);
    expect(openChallenge(sealed, key, { uid: "u2", purpose: "register" }, now)).toBeNull();
    expect(openChallenge(sealed, key, { uid: "u1", purpose: "authenticate" }, now)).toBeNull();
    expect(openChallenge(sealed, key, { uid: "u1", purpose: "register" }, now + 301)).toBeNull();
  });
  it("rejects a malformed action hash", () => {
    expect(() => newChallenge("u1", "authenticate", "not-a-hash", now)).toThrow();
  });
});

describe("relying party from request", () => {
  const req = (origin: string | null, host: string) =>
    new Request("http://x/", { headers: { ...(origin ? { origin } : {}), host } });
  it("accepts our own site", () => {
    expect(relyingPartyFrom(req("https://trackrecord-tau.vercel.app", "trackrecord-tau.vercel.app"))).toEqual({
      rpID: "trackrecord-tau.vercel.app",
      origin: "https://trackrecord-tau.vercel.app",
    });
    expect(relyingPartyFrom(req("http://localhost:3000", "localhost:3000"))?.rpID).toBe("localhost");
  });
  it("refuses other sites, plain http outside localhost, and missing origin", () => {
    expect(relyingPartyFrom(req("https://evil.example", "trackrecord-tau.vercel.app"))).toBeNull();
    expect(relyingPartyFrom(req("http://trackrecord-tau.vercel.app", "trackrecord-tau.vercel.app"))).toBeNull();
    expect(relyingPartyFrom(req(null, "trackrecord-tau.vercel.app"))).toBeNull();
  });
});
