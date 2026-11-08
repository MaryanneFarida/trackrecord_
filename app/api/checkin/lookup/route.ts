import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { serverEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { athletePhotos } from "@/lib/athletes/admin";
import { athleteSecret, makeScanToken, parseQr, verifyCode } from "@/lib/checkin/totp";
import { checkInOpen, statusId } from "@/lib/checkin/rules";
import { CHECKIN_STATUS } from "@/lib/checkin/summary";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";

const body = z.object({ qr: z.string().max(300), eventId: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/) }).strict();

/**
 * The official scanned a code. If it is fresh and the athlete is on the sealed
 * list, the official gets the athlete's verified selfie to compare with the
 * face in front of them. Every lookup, good or bad, is audited.
 */
export async function POST(req: Request) {
  const session = await apiSession(req, "official");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const qr = parseQr(parsed.data.qr);
  if (!qr) return Response.json({ error: "bad_qr" }, { status: 400 });
  if (qr.eventId !== parsed.data.eventId) return Response.json({ error: "wrong_event" }, { status: 400 });

  const db = adminDb();
  const [ev, entry, status] = await Promise.all([
    db.collection(EVENTS_COLLECTION).doc(qr.eventId).get(),
    db.collection(startListPath(qr.eventId)).doc(qr.athleteId).get(),
    db.collection(CHECKIN_STATUS).doc(statusId(qr.eventId, qr.athleteId)).get(),
  ]);
  const now = Date.now();
  if (!ev.exists || !checkInOpen({ sealedAt: ev.get("sealedAt"), raceStart: ev.get("raceStart") }, now)) {
    return Response.json({ error: "checkin_closed" }, { status: 409 });
  }
  if (!entry.exists) {
    audit("checkin.not_on_list", session.uid, { eventId: qr.eventId, athleteId: qr.athleteId });
    return Response.json({ error: "not_on_list" }, { status: 404 });
  }
  if (!verifyCode(athleteSecret(serverEnv().TOTP_MASTER_SECRET, qr.eventId, qr.athleteId), qr.code, now)) {
    audit("checkin.bad_code", session.uid, { eventId: qr.eventId, athleteId: qr.athleteId }); // an old screenshot, or a guess
    return Response.json({ error: "bad_code" }, { status: 400 });
  }
  if (status.exists) return Response.json({ error: "already_checked_in" }, { status: 409 });

  const photos = await athletePhotos(qr.athleteId);
  audit("checkin.lookup", session.uid, { eventId: qr.eventId, athleteId: qr.athleteId });
  return Response.json(
    {
      athlete: {
        athleteId: qr.athleteId,
        fullName: entry.get("fullName"),
        sportClass: entry.get("sportClass"),
        events: entry.get("events"),
        guideRunner: entry.get("guideRunner") === true,
        selfie: photos?.selfie ?? null,
      },
      scanToken: makeScanToken(serverEnv().TOTP_MASTER_SECRET, { eventId: qr.eventId, athleteId: qr.athleteId, officialId: session.uid, at: now }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
