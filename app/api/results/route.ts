import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { isFresh } from "@/lib/events/rules";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";
import { CHECKIN_STATUS } from "@/lib/checkin/summary";
import { statusId } from "@/lib/checkin/rules";
import { canEnter, entryId, resultPayload, type Side } from "@/lib/results/rules";
import { ENTRIES, finalizeResult } from "@/lib/results/server";
import { formatTime } from "@/lib/schemas";

const body = z.object({ payload: resultPayload, assertion: z.any() });

class Refused extends Error {}

/** A coach or an athlete enters a time, signed. Once entered it can never be changed. */
export async function POST(req: Request) {
  const session = await apiSession(req, null);
  if (session instanceof Response) return session;
  if (session.role !== "coach" && session.role !== "athlete") return Response.json({ error: "forbidden" }, { status: 403 });
  const side: Side = session.role;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  const now = Date.now();
  if (!isFresh(p.at, now)) return Response.json({ error: "stale" }, { status: 400 });

  const db = adminDb();
  const ref = db.collection(ENTRIES).doc(entryId(p.eventId, p.race, p.athleteId, side));
  const [ev, entry, checked, existing] = await Promise.all([
    db.collection(EVENTS_COLLECTION).doc(p.eventId).get(),
    db.collection(startListPath(p.eventId)).doc(p.athleteId).get(),
    db.collection(CHECKIN_STATUS).doc(statusId(p.eventId, p.athleteId)).get(),
    ref.get(),
  ]);
  if (!ev.exists) return Response.json({ error: "not_found" }, { status: 404 });
  const rule = canEnter({
    side,
    sessionUid: session.uid,
    athleteId: p.athleteId,
    onList: entry.exists,
    racesEntered: (entry.get("events") as string[] | undefined) ?? [],
    race: p.race,
    checkedIn: checked.exists,
    entryWindowEnd: ev.get("entryWindowEnd"),
    now,
  });
  if (rule) return Response.json({ error: rule }, { status: 400 });
  if (existing.exists) return Response.json({ error: "already_entered" }, { status: 409 });

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) throw new Refused();
      tx.create(ref, {
        eventId: p.eventId,
        race: p.race,
        athleteId: p.athleteId,
        side,
        createdBy: session.uid,
        hundredths: p.hundredths,
        signedAt: p.at,
        receivedAt: new Date().toISOString(),
        signedHash: signed.actionHash,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return Response.json({ error: "already_entered" }, { status: 409 });
    throw err;
  }
  audit("result.entered", session.uid, { eventId: p.eventId, race: p.race, athleteId: p.athleteId, side, passkeyId: signed.passkeyId });

  const outcome = await finalizeResult(p.eventId, p.race, p.athleteId);
  if (outcome) {
    const kind = outcome.type === "RESULT_LOCKED" ? "result_locked" : "result_contested";
    for (const uid of [p.athleteId, outcome.coachId]) {
      notify(uid, { kind, eventName: ev.get("name"), race: p.race, seq: outcome.seq }, appUrlFrom(req));
    }
  }
  return Response.json({
    ok: true,
    status: outcome ? (outcome.type === "RESULT_LOCKED" ? "locked" : "contested") : "waiting",
    seq: outcome?.seq ?? null,
    time: formatTime(p.hundredths),
  });
}
