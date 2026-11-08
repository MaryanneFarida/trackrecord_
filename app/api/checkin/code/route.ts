import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { serverEnv } from "@/lib/env";
import { athleteSecret, currentCode, qrText } from "@/lib/checkin/totp";
import { checkInOpen, statusId } from "@/lib/checkin/rules";
import { CHECKIN_STATUS } from "@/lib/checkin/summary";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";

const body = z.object({ eventId: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/) }).strict();

/**
 * The athlete's phone asks for its current check-in code every few seconds.
 * The secret never leaves the server; the phone only ever sees a code that
 * stops working within a minute.
 */
export async function POST(req: Request) {
  const session = await apiSession(req, "athlete");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { eventId } = parsed.data;
  const db = adminDb();
  const [ev, entry, status] = await Promise.all([
    db.collection(EVENTS_COLLECTION).doc(eventId).get(),
    db.collection(startListPath(eventId)).doc(session.uid).get(),
    db.collection(CHECKIN_STATUS).doc(statusId(eventId, session.uid)).get(),
  ]);
  if (!ev.exists || !entry.exists) return Response.json({ error: "not_on_list" }, { status: 404 });
  if (status.exists) return Response.json({ status: "checked_in", at: status.get("at") }, { headers: { "Cache-Control": "no-store" } });
  if (!checkInOpen({ sealedAt: ev.get("sealedAt"), raceStart: ev.get("raceStart") }, Date.now())) {
    return Response.json({ error: "checkin_closed" }, { status: 409 });
  }
  const { code, expiresAt } = currentCode(athleteSecret(serverEnv().TOTP_MASTER_SECRET, eventId, session.uid), Date.now());
  return Response.json({ status: "waiting", qr: qrText(eventId, session.uid, code), code, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
