import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { apiSession } from "@/lib/auth/api";
import { seal } from "@/lib/crypto/files";
import { applicationSchema, decodeJpeg } from "@/lib/athletes/schema";
import { audit } from "@/lib/passkeys/http";

/** An athlete applies: profile + ID photo + selfie. Photos are encrypted before they're stored. */
export async function POST(req: Request) {
  const session = await apiSession(req, null);
  if (session instanceof Response) return session;
  if (session.role) return Response.json({ error: "already_has_role" }, { status: 400 });

  const parsed = applicationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  const a = parsed.data;
  const idPhoto = decodeJpeg(a.idPhoto);
  const selfie = decodeJpeg(a.selfie);
  if (!idPhoto || !selfie) return Response.json({ error: "bad_photo" }, { status: 400 });

  const db = adminDb();
  const ref = db.collection("athletes").doc(session.uid);
  const existing = await ref.get();
  if (existing.exists && existing.get("status") === "verified") return Response.json({ error: "already_verified" }, { status: 400 });

  const key = serverEnv().FILE_ENCRYPTION_KEY;
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.collection("athletePrivate").doc(session.uid), {
    idPhoto: seal(idPhoto, key, `athlete:${session.uid}:idPhoto`),
    selfie: seal(selfie, key, `athlete:${session.uid}:selfie`),
    updatedAt: now,
  });
  batch.set(ref, {
    email: session.email,
    fullName: a.fullName,
    licenceNo: a.licenceNo,
    sportClass: a.sportClass,
    events: a.events,
    guideRunner: a.guideRunner,
    consentAt: now,
    status: "pending",
    submittedAt: now,
    rejectionCode: null,
    rejectionNote: null,
  });
  await batch.commit();
  audit("athlete.applied", session.uid, { resubmission: existing.exists });
  return Response.json({ ok: true });
}
