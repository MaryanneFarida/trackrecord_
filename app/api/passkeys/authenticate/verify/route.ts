import { z } from "zod";
import { audit, ceremony, takeChallenge } from "@/lib/passkeys/http";
import { finishAuthentication } from "@/lib/passkeys/service";
import { firestoreStore } from "@/lib/passkeys/firestore-store";

const body = z.object({ response: z.any() });

export async function POST(req: Request) {
  const ctx = await ceremony(req);
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const challenge = await takeChallenge(ctx.session.uid, "authenticate");
  if (!challenge) return Response.json({ error: "challenge_expired" }, { status: 400 });
  try {
    const result = await finishAuthentication({
      rp: ctx.rp,
      uid: ctx.session.uid,
      response: parsed.data.response,
      challenge,
      store: firestoreStore(),
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      audit("passkey.verify_failed", ctx.session.uid, { reason: result.reason });
      return Response.json({ error: result.reason }, { status: 400 });
    }
    audit("passkey.verified", ctx.session.uid, { passkeyId: result.passkeyId, actionHash: result.actionHash });
    return Response.json({ ok: true, passkeyId: result.passkeyId, actionHash: result.actionHash });
  } catch {
    audit("passkey.verify_failed", ctx.session.uid, { reason: "error" });
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }
}
