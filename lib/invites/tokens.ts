import { createHash, randomBytes } from "node:crypto";

/** Roles the admin can invite. Athletes register themselves and are verified instead. */
export const INVITABLE_ROLES = ["coach", "official", "doctor", "tribunal", "admin"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export const INVITE_DAYS = 7;

/**
 * An invite link carries a random 256-bit token. We store only its SHA-256
 * hash, so even someone reading the database can't use a pending invite.
 */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type InviteProblem = "not_found" | "used" | "expired" | "wrong_email" | "has_role";

export function checkInvite(
  invite: { usedBy: string | null; expiresAt: string; email: string | null } | null,
  user: { email: string | null; role: string | null },
  now: Date,
): InviteProblem | null {
  if (!invite) return "not_found";
  if (invite.usedBy) return "used";
  if (new Date(invite.expiresAt) < now) return "expired";
  if (invite.email && invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) return "wrong_email";
  if (user.role) return "has_role";
  return null;
}
