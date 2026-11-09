import { adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { ledgerAppend } from "@/lib/ledger/server";
import { sha256Hex } from "@/lib/ledger/hash";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { respondPayload } from "@/lib/selection/rules";
import { REMOVALS } from "@/lib/selection/server";

class Refused extends Error {}

/** The athlete answers a proposed removal, once, signed. The tribunal reads it before deciding. */
export async function POST(req: Request) {
  const r = await signedRequest(req, "athlete", respondPayload);
  if (r instanceof Response) return r;
  const { session, p, signedHash } = r;
  if (p.response.trim().length < 10) return fail("response_too_short");
  const ref = adminDb().collection(REMOVALS).doc(p.removalId);
  const pre = await ref.get();
  if (!pre.exists || pre.get("athleteId") !== session.uid) return fail("not_found", 404);
  if (pre.get("status") !== "proposed") return fail("already_reviewed", 409);
  try {
    await ledgerAppend("REMOVAL_RESPONSE", { removalId: p.removalId, athleteId: session.uid, responseHash: sha256Hex({ response: p.response }), signedHash }, async (tx, rr) => {
      const doc = await tx.get(ref);
      if (doc.get("response") !== null || doc.get("status") !== "proposed") throw new Refused();
      tx.update(ref, { response: p.response.trim(), respondedAt: rr.createdAt, responseSeq: rr.seq });
    });
  } catch (err) {
    if (err instanceof Refused) return fail("already_answered", 409);
    throw err;
  }
  audit("removal.answered", session.uid, { removalId: p.removalId });
  return Response.json({ ok: true });
}
