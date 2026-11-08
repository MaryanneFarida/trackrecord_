import { z } from "zod";
import { audit, ceremony, takeChallenge } from "@/lib/passkeys/http";
import { finishRegistration } from "@/lib/passkeys/service";
import { firestoreStore } from "@/lib/passkeys/firestore-store";

const body = z.object({ response: z.any(), label: z.string().max(60).default("Passkey") });

export async function POST(req: Request) {
  const ctx = await ceremony(req);
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const challenge = await takeChallenge(ctx.session.uid, "register");
  if (!challenge) return Response.json({ error: "challenge_expired" }, { status: 400 });
  try {
    const result = await finishRegistration({
      rp: ctx.rp,
      uid: ctx.session.uid,
      response: parsed.data.response,
      challenge,
      label: parsed.data.label,
      store: firestoreStore(),
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      audit("passkey.register_failed", ctx.session.uid);
      return Response.json({ error: "not_verified" }, { status: 400 });
    }
    audit("passkey.registered", ctx.session.uid, { passkeyId: result.id, label: parsed.data.label });
    return Response.json({ ok: true });
  } catch {
    audit("passkey.register_failed", ctx.session.uid);
    return Response.json({ error: "not_verified" }, { status: 400 });
  }
}
