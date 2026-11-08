import { describe, expect, it } from "vitest";
import { checkInvite, hashInviteToken, newInviteToken } from "./tokens";

const now = new Date("2026-11-08T10:00:00Z");
const invite = { usedBy: null, expiresAt: "2026-11-15T10:00:00Z", email: "Martin@Coach.ke" };
const user = { email: "martin@coach.ke", role: null };

describe("invites", () => {
  it("stores only a hash of the token", () => {
    const { token, tokenHash } = newInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).not.toContain(token);
  });
  it("accepts a fresh invite for the right email (any letter case)", () => {
    expect(checkInvite(invite, user, now)).toBeNull();
  });
  it("refuses used, expired, wrong-email, unknown and already-roled cases", () => {
    expect(checkInvite({ ...invite, usedBy: "x" }, user, now)).toBe("used");
    expect(checkInvite(invite, user, new Date("2026-11-16T00:00:00Z"))).toBe("expired");
    expect(checkInvite(invite, { ...user, email: "other@x.ke" }, now)).toBe("wrong_email");
    expect(checkInvite(null, user, now)).toBe("not_found");
    expect(checkInvite(invite, { ...user, role: "athlete" }, now)).toBe("has_role");
  });
});
