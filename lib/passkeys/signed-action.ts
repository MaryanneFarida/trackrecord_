import "server-only";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { sha256Hex } from "@/lib/ledger/hash";
import type { Session } from "@/lib/auth/session";
import { firestoreStore } from "./firestore-store";
import { audit, takeChallenge } from "./http";
import { relyingPartyFrom } from "./rp";
import { finishAuthentication } from "./service";

/**
 * Checks that the user approved EXACTLY this payload with their passkey.
 * The browser hashed the same canonical JSON and the phone signed that hash,
 * so changing any field of the payload makes the signature fail.
 */
export async function verifySignedAction(args: {
  req: Request;
  session: Session;
  payload: Record<string, unknown>;
  assertion: AuthenticationResponseJSON;
  action: string;
}): Promise<{ ok: true; passkeyId: string; actionHash: string } | { ok: false; error: string }> {
  const rp = relyingPartyFrom(args.req);
  if (!rp) return { ok: false, error: "bad_origin" };
  const expected = sha256Hex(args.payload);
  const challenge = await takeChallenge(args.session.uid, "authenticate");
  if (!challenge) return { ok: false, error: "challenge_expired" };
  if (challenge.actionHash !== expected) {
    audit("signature.mismatch", args.session.uid, { action: args.action });
    return { ok: false, error: "bad_signature" };
  }
  try {
    const result = await finishAuthentication({
      rp,
      uid: args.session.uid,
      response: args.assertion,
      challenge,
      store: firestoreStore(),
      now: new Date().toISOString(),
    });
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, passkeyId: result.passkeyId, actionHash: expected };
  } catch {
    return { ok: false, error: "bad_signature" };
  }
}
