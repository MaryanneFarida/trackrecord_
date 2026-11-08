import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/passkeys/http";
import { relyingPartyFrom } from "@/lib/passkeys/rp";
import { INVITABLE_ROLES, INVITE_DAYS, newInviteToken } from "@/lib/invites/tokens";

const payloadSchema = z
  .object({
    action: z.literal("invite.create"),
    role: z.enum(INVITABLE_ROLES),
    // No trimming or lower-casing here: the payload must stay byte-for-byte what the admin signed.
    email: z.string().email().refine((e) => e === e.toLowerCase(), "lowercase").nullable(),
    kmpdcNo: z.string().max(30).nullable(),
    note: z.string().max(120),
    at: z.string().datetime(),
  })
  .strict();
const body = z.object({ payload: payloadSchema, assertion: z.any() });

/** Admin creates a single-use invite link for one role. Signed with the admin's passkey. */
export async function POST(req: Request) {
  const session = await apiSession(req, "admin");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  if (p.role === "doctor" && !p.kmpdcNo) return Response.json({ error: "kmpdc_required" }, { status: 400 });
  if (Math.abs(Date.now() - Date.parse(p.at)) > 10 * 60 * 1000) return Response.json({ error: "stale" }, { status: 400 });

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  const { token, tokenHash } = newInviteToken();
  const now = new Date();
  await adminDb()
    .collection("invites")
    .doc(tokenHash)
    .set({
      role: p.role,
      email: p.email,
      kmpdcNo: p.kmpdcNo,
      note: p.note,
      createdBy: session.uid,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86400_000).toISOString(),
      usedBy: null,
      usedAt: null,
    });
  audit("invite.created", session.uid, { role: p.role, email: p.email, inviteId: tokenHash.slice(0, 12), signedHash: signed.actionHash });

  const origin = relyingPartyFrom(req)?.origin ?? "";
  return Response.json({ ok: true, link: `${origin}/invite/${token}` }); // shown once; only the hash is stored
}
