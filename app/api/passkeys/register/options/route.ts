import { ceremony, nowSeconds, saveChallenge } from "@/lib/passkeys/http";
import { newChallenge } from "@/lib/passkeys/challenge";
import { registrationOptions } from "@/lib/passkeys/service";
import { firestoreStore } from "@/lib/passkeys/firestore-store";

/** Adding a passkey needs a sign-in from the last 10 minutes, so a stolen old session can't add an attacker's key. */
const RECENT_SIGN_IN_SECONDS = 10 * 60;

export async function POST(req: Request) {
  const ctx = await ceremony(req);
  if (ctx instanceof Response) return ctx;
  if (nowSeconds() - ctx.session.authTime > RECENT_SIGN_IN_SECONDS) {
    return Response.json({ error: "sign_in_again" }, { status: 401 });
  }
  const challenge = newChallenge(ctx.session.uid, "register", null, nowSeconds());
  const options = await registrationOptions({
    rp: ctx.rp,
    uid: ctx.session.uid,
    userName: ctx.session.email ?? ctx.session.uid,
    store: firestoreStore(),
    challenge,
  });
  await saveChallenge(challenge);
  return Response.json({ options });
}
