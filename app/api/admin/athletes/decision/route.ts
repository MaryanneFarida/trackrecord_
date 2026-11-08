import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/passkeys/http";
import { checkDecision, rejectionCodes } from "@/lib/athletes/schema";

const payloadSchema = z
  .object({
    action: z.literal("athlete.decision"),
    athleteUid: z.string().min(1).max(128),
    decision: z.enum(["approve", "reject"]),
    reasonCode: z.enum(rejectionCodes).nullable(), // fixed list only
    note: z.string().max(300), // not trimmed: must match what the admin signed
    at: z.string().datetime(),
  })
  .strict();
const body = z.object({ payload: payloadSchema, assertion: z.any() });

/** Admin approves or rejects an athlete. Signed with the admin's passkey over this exact decision. */
export async function POST(req: Request) {
  const session = await apiSession(req, "admin");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  const rule = checkDecision(p);
  if (rule) return Response.json({ error: rule }, { status: 400 });
  if (Math.abs(Date.now() - Date.parse(p.at)) > 10 * 60 * 1000) return Response.json({ error: "stale" }, { status: 400 });

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  const ref = adminDb().collection("athletes").doc(p.athleteUid);
  const doc = await ref.get();
  if (!doc.exists || doc.get("status") !== "pending") return Response.json({ error: "not_pending" }, { status: 409 });

  const now = new Date().toISOString();
  if (p.decision === "approve") {
    await adminAuth().setCustomUserClaims(p.athleteUid, { role: "athlete" });
    await adminAuth().revokeRefreshTokens(p.athleteUid); // next sign-in carries the new role
    await ref.update({ status: "verified", verifiedBy: session.uid, verifiedAt: now, rejectionCode: null, rejectionNote: null });
    await adminDb().collection("users").doc(p.athleteUid).set({ role: "athlete" }, { merge: true });
  } else {
    await ref.update({ status: "rejected", rejectionCode: p.reasonCode, rejectionNote: p.note || null, reviewedBy: session.uid, reviewedAt: now });
  }
  audit(`athlete.${p.decision === "approve" ? "verified" : "rejected"}`, session.uid, {
    athleteUid: p.athleteUid,
    reasonCode: p.reasonCode,
    note: p.note || null,
    signedHash: signed.actionHash,
    passkeyId: signed.passkeyId,
  });
  return Response.json({ ok: true });
}
