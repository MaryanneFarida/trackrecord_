import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * One passkey ceremony = one short-lived challenge. We keep it in a signed,
 * httpOnly cookie instead of the database: it expires after 5 minutes, is
 * tied to one user and one purpose, and is deleted once used. The optional
 * actionHash binds a signature to exactly one action (for example one race
 * entry), so a signature for one thing can never be reused for another.
 */
export const CHALLENGE_COOKIE = "__pk_challenge";
export const CHALLENGE_TTL_SECONDS = 5 * 60;

export type Purpose = "register" | "authenticate";

export interface ChallengeState {
  challenge: string; // base64url, what the authenticator signs
  uid: string;
  purpose: Purpose;
  actionHash: string | null; // hex SHA-256 of the action being approved
  exp: number; // unix seconds
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** A separate key just for these cookies, derived from FILE_ENCRYPTION_KEY (HKDF). */
function cookieKey(masterHex: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(masterHex, "hex"), Buffer.alloc(0), "trackrecord/passkey-challenge/v1", 32));
}

export function newChallenge(uid: string, purpose: Purpose, actionHash: string | null, nowSeconds: number): ChallengeState {
  if (actionHash !== null && !/^[0-9a-f]{64}$/.test(actionHash)) throw new Error("actionHash must be 64 hex characters");
  const parts = [randomBytes(16)];
  if (actionHash) parts.push(Buffer.from(actionHash, "hex"));
  return { challenge: b64url(Buffer.concat(parts)), uid, purpose, actionHash, exp: nowSeconds + CHALLENGE_TTL_SECONDS };
}

export function sealChallenge(state: ChallengeState, masterHex: string): string {
  const body = b64url(Buffer.from(JSON.stringify(state)));
  const sig = b64url(createHmac("sha256", cookieKey(masterHex)).update(body).digest());
  return `${body}.${sig}`;
}

/** Returns the state only if the cookie is untampered, unexpired, and for this user and purpose. */
export function openChallenge(
  sealed: string | undefined,
  masterHex: string,
  expect: { uid: string; purpose: Purpose },
  nowSeconds: number,
): ChallengeState | null {
  if (!sealed) return null;
  const [body, sig] = sealed.split(".");
  if (!body || !sig) return null;
  const good = createHmac("sha256", cookieKey(masterHex)).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ChallengeState;
    if (state.uid !== expect.uid || state.purpose !== expect.purpose) return null;
    if (state.exp < nowSeconds) return null;
    return state;
  } catch {
    return null;
  }
}
