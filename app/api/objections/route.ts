import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { ledgerAppend } from "@/lib/ledger/server";
import { sha256Hex } from "@/lib/ledger/hash";
import { canObject, categoryLabel, isFresh, objectionId, objectionPayload, type EventRules } from "@/lib/events/rules";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";

const body = z.object({ payload: objectionPayload, assertion: z.any() });

class Refused extends Error {}

/**
 * A coach's ONLY power over a start list: an objection, on the record.
 * It removes nobody. The athlete is told, can answer, and the tribunal can
 * see every objection a coach has ever raised.
 */
export async function POST(req: Request) {
  const session = await apiSession(req, "coach");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  if (!isFresh(p.at, Date.now())) return Response.json({ error: "stale" }, { status: 400 });

  const db = adminDb();
  const [ev, entry] = await Promise.all([
    db.collection(EVENTS_COLLECTION).doc(p.eventId).get(),
    db.collection(startListPath(p.eventId)).doc(p.athleteId).get(),
  ]);
  if (!ev.exists) return Response.json({ error: "not_found" }, { status: 404 });
  const rule = canObject({ event: ev.data() as EventRules, onList: entry.exists, reason: p.reason, now: Date.now() });
  if (rule) return Response.json({ error: rule }, { status: 400 });

  const id = objectionId(p.eventId, p.athleteId, session.uid);
  const ref = db.collection("objections").doc(id);
  if ((await ref.get()).exists) return Response.json({ error: "already_objected" }, { status: 409 }); // before asking for the passkey

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  const reasonHash = sha256Hex({ reason: p.reason });
  try {
    // The public ledger gets the fact and a fingerprint of the reason; the full text stays with the athlete, coach and tribunal.
    await ledgerAppend(
      "OBJECTION",
      { objectionId: id, eventId: p.eventId, athleteId: p.athleteId, coachId: session.uid, category: p.category, reasonHash, signedHash: signed.actionHash },
      async (tx, rec) => {
        if ((await tx.get(ref)).exists) throw new Refused();
        tx.create(ref, {
          eventId: p.eventId,
          athleteId: p.athleteId,
          createdBy: session.uid,
          reasonCategory: p.category,
          reason: p.reason,
          createdAt: rec.createdAt,
          signedHash: signed.actionHash,
          ledgerSeq: rec.seq,
          response: null,
        });
      },
    );
  } catch (err) {
    if (err instanceof Refused) return Response.json({ error: "already_objected" }, { status: 409 });
    throw err;
  }
  audit("objection.created", session.uid, { objectionId: id, eventId: p.eventId, athleteId: p.athleteId, passkeyId: signed.passkeyId });
  notify(p.athleteId, { kind: "objection_received", eventName: ev.get("name"), category: categoryLabel(p.category), reason: p.reason }, appUrlFrom(req));
  return Response.json({ ok: true, objectionId: id });
}
