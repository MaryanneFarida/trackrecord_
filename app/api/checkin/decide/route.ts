import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { serverEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { isFresh } from "@/lib/events/rules";
import { openScanToken } from "@/lib/checkin/totp";
import { checkInOpen, checkInPayload, statusId } from "@/lib/checkin/rules";
import { CHECKINS, CHECKIN_STATUS } from "@/lib/checkin/summary";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";

const body = z.object({ payload: checkInPayload, assertion: z.any() });

/**
 * The official's decision after the face check, signed with their passkey.
 * Every attempt is kept (a refusal is never erased by a later success), and
 * the athlete is told straight away if they were refused.
 */
export async function POST(req: Request) {
  const session = await apiSession(req, "official");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  const now = Date.now();
  if (!isFresh(p.at, now)) return Response.json({ error: "stale" }, { status: 400 });
  if (!openScanToken(serverEnv().TOTP_MASTER_SECRET, p.scanToken, { eventId: p.eventId, athleteId: p.athleteId, officialId: session.uid }, now)) {
    return Response.json({ error: "scan_expired" }, { status: 400 });
  }

  const db = adminDb();
  const [ev, entry] = await Promise.all([
    db.collection(EVENTS_COLLECTION).doc(p.eventId).get(),
    db.collection(startListPath(p.eventId)).doc(p.athleteId).get(),
  ]);
  if (!ev.exists || !checkInOpen({ sealedAt: ev.get("sealedAt"), raceStart: ev.get("raceStart") }, now)) {
    return Response.json({ error: "checkin_closed" }, { status: 409 });
  }
  if (!entry.exists) return Response.json({ error: "not_on_list" }, { status: 404 });
  if (p.outcome === "checked_in" && entry.get("guideRunner") === true && p.guideName.trim().length < 2) {
    return Response.json({ error: "guide_required" }, { status: 400 });
  }

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  const statusRef = db.collection(CHECKIN_STATUS).doc(statusId(p.eventId, p.athleteId));
  const attemptRef = db.collection(CHECKINS).doc();
  const at = new Date().toISOString();
  const result = await db.runTransaction(async (tx) => {
    if ((await tx.get(statusRef)).exists) return "already_checked_in" as const;
    tx.create(attemptRef, {
      eventId: p.eventId,
      athleteId: p.athleteId,
      officialId: session.uid,
      outcome: p.outcome,
      guideName: p.guideName || null,
      at,
      signedHash: signed.actionHash,
    });
    if (p.outcome === "checked_in") tx.create(statusRef, { eventId: p.eventId, athleteId: p.athleteId, at, attemptId: attemptRef.id });
    return "ok" as const;
  });
  if (result !== "ok") return Response.json({ error: result }, { status: 409 });

  audit(`checkin.${p.outcome}`, session.uid, { eventId: p.eventId, athleteId: p.athleteId, attemptId: attemptRef.id, passkeyId: signed.passkeyId });
  if (p.outcome === "refused_face") {
    notify(p.athleteId, { kind: "checkin_refused", eventName: ev.get("name") }, appUrlFrom(req));
  }
  return Response.json({ ok: true });
}
