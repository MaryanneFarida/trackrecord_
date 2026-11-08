import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { apiSession } from "@/lib/auth/api";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { canRegister, formatEAT, isFresh, registrationPayload, type EventRules } from "@/lib/events/rules";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";

const body = z.object({ payload: registrationPayload, assertion: z.any() });

/**
 * The athlete registers THEMSELVES, signed with their own passkey.
 * If the rules say yes, they are on the list: no coach or admin approves it.
 */
export async function POST(req: Request) {
  const session = await apiSession(req, "athlete");
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const p = parsed.data.payload;
  if (!isFresh(p.at, Date.now())) return Response.json({ error: "stale" }, { status: 400 });

  const signed = await verifySignedAction({ req, session, payload: p, assertion: parsed.data.assertion, action: p.action });
  if (!signed.ok) return Response.json({ error: signed.error }, { status: 400 });

  const db = adminDb();
  const eventRef = db.collection(EVENTS_COLLECTION).doc(p.eventId);
  const entryRef = db.collection(startListPath(p.eventId)).doc(session.uid);
  const athleteRef = db.collection("athletes").doc(session.uid);

  // All checks and the write in one transaction: if the list is sealed meanwhile, this fails safely.
  const result = await db.runTransaction(async (tx) => {
    const [ev, entry, athlete] = await Promise.all([tx.get(eventRef), tx.get(entryRef), tx.get(athleteRef)]);
    if (!ev.exists) return { error: "not_found" } as const;
    const a = athlete.exists ? (athlete.data() as { status: string; sportClass: string; events: string[]; fullName: string; guideRunner: boolean }) : null;
    const error = canRegister({ athlete: a, event: ev.data() as EventRules, races: p.races, alreadyRegistered: entry.exists, now: Date.now() });
    if (error || !a) return { error: error ?? "athlete_not_verified" } as const;
    const registeredAt = new Date().toISOString();
    tx.create(entryRef, {
      athleteId: session.uid,
      fullName: a.fullName,
      sportClass: a.sportClass,
      events: p.races,
      guideRunner: a.guideRunner,
      registeredAt,
      signedHash: signed.actionHash,
    });
    return { ok: true, eventName: ev.get("name") as string, lockTime: ev.get("lockTime") as string } as const;
  });

  if ("error" in result) {
    audit("registration.refused", session.uid, { eventId: p.eventId, reason: result.error });
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  audit("registration.created", session.uid, { eventId: p.eventId, races: p.races, signedHash: signed.actionHash, passkeyId: signed.passkeyId });
  notify(session.uid, { kind: "registration_confirmed", eventName: result.eventName, races: p.races, lockTime: formatEAT(result.lockTime) }, appUrlFrom(req));
  return Response.json({ ok: true });
}
