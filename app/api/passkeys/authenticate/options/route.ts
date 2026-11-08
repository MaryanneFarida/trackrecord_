import { z } from "zod";
import { ceremony, nowSeconds, saveChallenge } from "@/lib/passkeys/http";
import { newChallenge } from "@/lib/passkeys/challenge";
import { authenticationOptions } from "@/lib/passkeys/service";
import { firestoreStore } from "@/lib/passkeys/firestore-store";

/** actionHash = SHA-256 (hex) of exactly what the user is approving, e.g. one race entry. */
const body = z.object({ actionHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null) });

export async function POST(req: Request) {
  const ctx = await ceremony(req);
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const challenge = newChallenge(ctx.session.uid, "authenticate", parsed.data.actionHash, nowSeconds());
  const options = await authenticationOptions({ rp: ctx.rp, uid: ctx.session.uid, store: firestoreStore(), challenge });
  if (!options) return Response.json({ error: "no_passkey" }, { status: 400 });
  await saveChallenge(challenge);
  return Response.json({ options });
}
