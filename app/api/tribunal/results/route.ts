import { adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { ledgerAppend } from "@/lib/ledger/server";
import { sha256Hex } from "@/lib/ledger/hash";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { decidePayload } from "@/lib/selection/rules";
import { RESULTS } from "@/lib/results/server";
import { resultId } from "@/lib/results/rules";

class Refused extends Error {}

/**
 * A tribunal member rules on a contested result. The decision is a NEW ledger
 * record pointing to the contested one; the original disagreement stays visible.
 */
export async function POST(req: Request) {
  const r = await signedRequest(req, "tribunal", decidePayload);
  if (r instanceof Response) return r;
  const { session, p, signedHash } = r;
  if (p.reason.trim().length < 20) return fail("reason_too_short");
  const ref = adminDb().collection(RESULTS).doc(resultId(p.eventId, p.race, p.athleteId));
  const pre = await ref.get();
  if (!pre.exists || pre.get("status") !== "contested") return fail("not_contested", 409);
  let seq = 0;
  try {
    const rec = await ledgerAppend(
      "TRIBUNAL_DECISION",
      { eventId: p.eventId, race: p.race, athleteId: p.athleteId, hundredths: p.hundredths, contestedSeq: pre.get("ledgerSeq"), reasonHash: sha256Hex({ reason: p.reason }), decidedBy: session.uid, signedHash },
      async (tx, rr) => {
        const doc = await tx.get(ref);
        if (doc.get("status") !== "contested") throw new Refused();
        tx.update(ref, { status: "decided", finalHundredths: p.hundredths, decisionSeq: rr.seq, decisionReason: p.reason.trim(), decidedBy: session.uid });
      },
    );
    seq = rec.seq;
  } catch (err) {
    if (err instanceof Refused) return fail("not_contested", 409);
    throw err;
  }
  audit("result.tribunal_decided", session.uid, { eventId: p.eventId, race: p.race, athleteId: p.athleteId, ledgerSeq: seq });
  const ev = await adminDb().collection("events").doc(p.eventId).get();
  for (const uid of [p.athleteId, pre.get("coachId") as string]) {
    notify(uid, { kind: "result_decided", eventName: ev.get("name") ?? "the qualifier", race: p.race, seq }, appUrlFrom(req));
  }
  return Response.json({ ok: true, ledgerSeq: seq });
}
