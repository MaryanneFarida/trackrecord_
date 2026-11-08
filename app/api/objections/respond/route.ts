import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { ledgerAppend } from "@/lib/ledger/server";
import { sha256Hex } from "@/lib/ledger/hash";
import { MIN_RESPONSE, isFresh, longEnough, objectionResponsePayload } from "@/lib/events/rules";

const body = z.object({ payload: objectionResponsePayload, assertion: z.any() });

class Refused extends Error {}

/** The athlete answers an objection, once, signed. The answer sits next to the objection forever. */
export async function POST(req: Request) {
  const session = await apiSession(req, "athlete");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  if (!isFresh(p.at, Date.now())) return Response.json({ error: "stale" }, { status: 400 });
  if (!longEnough(p.response, MIN_RESPONSE)) return Response.json({ error: "response_too_short" }, { status: 400 });

  const ref = adminDb().collection("objections").doc(p.objectionId);
  const pre = await ref.get();
  if (!pre.exists || pre.get("athleteId") !== session.uid) return Response.json({ error: "not_found" }, { status: 404 });
  if (pre.get("response") !== null) return Response.json({ error: "already_answered" }, { status: 409 });

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  try {
    await ledgerAppend(
      "OBJECTION_RESPONSE",
      { objectionId: p.objectionId, athleteId: session.uid, responseHash: sha256Hex({ response: p.response }), signedHash: signed.actionHash },
      async (tx, rec) => {
        const doc = await tx.get(ref);
        if (doc.get("response") !== null) throw new Refused();
        tx.update(ref, { response: p.response, respondedAt: rec.createdAt, responseSignedHash: signed.actionHash, responseLedgerSeq: rec.seq });
      },
    );
  } catch (err) {
    if (err instanceof Refused) return Response.json({ error: "already_answered" }, { status: 409 });
    throw err;
  }
  audit("objection.answered", session.uid, { objectionId: p.objectionId, passkeyId: signed.passkeyId });
  const [ev, athlete] = await Promise.all([
    adminDb().collection("events").doc(pre.get("eventId")).get(),
    adminDb().collection("athletes").doc(session.uid).get(),
  ]);
  notify(pre.get("createdBy"), { kind: "objection_answered", eventName: ev.get("name") ?? "a qualifier", athleteName: athlete.get("fullName") ?? "The athlete", response: p.response }, appUrlFrom(req));
  return Response.json({ ok: true });
}
