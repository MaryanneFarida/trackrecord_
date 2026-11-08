import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { getSession, type Session } from "@/lib/auth/session";
import { CHALLENGE_COOKIE, CHALLENGE_TTL_SECONDS, openChallenge, sealChallenge, type ChallengeState, type Purpose } from "./challenge";
import { relyingPartyFrom, type RelyingParty } from "./rp";

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Every passkey route starts here: same-site request, signed-in user. */
export async function ceremony(req: Request): Promise<{ session: Session; rp: RelyingParty } | Response> {
  const rp = relyingPartyFrom(req);
  if (!rp) return Response.json({ error: "bad_origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  return { session, rp };
}

export async function saveChallenge(state: ChallengeState) {
  (await cookies()).set(CHALLENGE_COOKIE, sealChallenge(state, serverEnv().FILE_ENCRYPTION_KEY), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/passkeys",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

/** Reads AND deletes the challenge: each one can be used exactly once. */
export async function takeChallenge(uid: string, purpose: Purpose): Promise<ChallengeState | null> {
  const jar = await cookies();
  const state = openChallenge(jar.get(CHALLENGE_COOKIE)?.value, serverEnv().FILE_ENCRYPTION_KEY, { uid, purpose }, nowSeconds());
  jar.delete({ name: CHALLENGE_COOKIE, path: "/api/passkeys" });
  return state;
}

/** Audit entry, written after the response so it never slows the user down. */
export function audit(action: string, uid: string, details: Record<string, unknown> = {}) {
  after(async () => {
    await adminDb()
      .collection("auditLog")
      .add({ action, uid, ...details, at: new Date().toISOString() })
      .catch((err) => console.error("audit not saved", err));
  });
}
