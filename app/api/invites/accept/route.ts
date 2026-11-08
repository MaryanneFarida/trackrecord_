import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { audit } from "@/lib/passkeys/http";
import { checkInvite, hashInviteToken } from "@/lib/invites/tokens";

const body = z.object({ token: z.string().min(20).max(100) }).strict();

/** The invited person accepts. Done in a transaction so one invite can never be used twice. */
export async function POST(req: Request) {
  const session = await apiSession(req, null);
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const db = adminDb();
  const ref = db.collection("invites").doc(hashInviteToken(parsed.data.token));
  let role: string | null = null;
  let problem: string | null = null;
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const invite = doc.exists ? (doc.data() as { usedBy: string | null; expiresAt: string; email: string | null; role: string }) : null;
    problem = checkInvite(invite, session, new Date());
    if (problem || !invite) return;
    role = invite.role;
    tx.update(ref, { usedBy: session.uid, usedAt: new Date().toISOString() });
    tx.set(db.collection("users").doc(session.uid), { role, kmpdcNo: doc.get("kmpdcNo") ?? null }, { merge: true });
  });
  if (problem || !role) {
    audit("invite.refused", session.uid, { problem });
    return Response.json({ error: problem ?? "not_found" }, { status: 400 });
  }
  await adminAuth().setCustomUserClaims(session.uid, { role });
  await adminAuth().revokeRefreshTokens(session.uid);
  audit("invite.accepted", session.uid, { role });
  return Response.json({ ok: true, role });
}
