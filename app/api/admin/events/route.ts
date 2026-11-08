import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/audit";
import { ledgerAppend } from "@/lib/ledger/server";
import { checkNewEvent, deriveTimes, eventCreatePayload, isFresh } from "@/lib/events/rules";
import { EVENTS_COLLECTION } from "@/lib/events/seal";

const body = z.object({ payload: eventCreatePayload, assertion: z.any() });

/**
 * Admin creates a qualifier. The lock time is DERIVED (race start - 24 h), never
 * typed in, and the event's rules go into the public ledger, so they can't be
 * changed later without it showing.
 */
export async function POST(req: Request) {
  const session = await apiSession(req, "admin");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  const now = Date.now();
  if (!isFresh(p.at, now)) return Response.json({ error: "stale" }, { status: 400 });
  if (p.name.trim().length < 3 || p.venue.trim().length < 2) return Response.json({ error: "bad_request" }, { status: 400 });
  const rule = checkNewEvent(p, now);
  if (rule) return Response.json({ error: rule }, { status: 400 });

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  const ref = adminDb().collection(EVENTS_COLLECTION).doc();
  const raceStart = new Date(p.raceStart).toISOString();
  const { lockTime, entryWindowEnd } = deriveTimes(raceStart);
  const fields = {
    name: p.name.trim(),
    venue: p.venue.trim(),
    raceStart,
    lockTime,
    entryWindowEnd,
    events: p.races,
    classes: p.classes,
    entryStandards: {},
  };
  // The ledger record and the event are written in one transaction: no event without its public record.
  const record = await ledgerAppend(
    "EVENT_CREATED",
    { eventId: ref.id, ...fields, createdBy: session.uid, signedHash: signed.actionHash },
    async (tx, rec) => {
      tx.create(ref, { ...fields, createdBy: session.uid, createdAt: rec.createdAt, signedHash: signed.actionHash, ledgerSeq: rec.seq, sealedAt: null });
    },
  );
  audit("event.created", session.uid, { eventId: ref.id, ledgerSeq: record.seq, passkeyId: signed.passkeyId });
  return Response.json({ ok: true, eventId: ref.id, ledgerSeq: record.seq });
}
