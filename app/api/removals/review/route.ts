import { adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { notify, appUrlFrom } from "@/lib/notify";
import { ledgerAppend } from "@/lib/ledger/server";
import { sha256Hex } from "@/lib/ledger/hash";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { canReview, reviewPayload } from "@/lib/selection/rules";
import { REMOVALS, getSelection, writeFinalList } from "@/lib/selection/server";

class Refused extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * An independent tribunal member approves or rejects a proposed removal.
 * Only an approval takes anyone off the list, and the next athlete moves up automatically.
 */
export async function POST(req: Request) {
  const r = await signedRequest(req, "tribunal", reviewPayload);
  if (r instanceof Response) return r;
  const { session, p, signedHash } = r;
  if (p.reason.trim().length < 20) return fail("reason_too_short");
  const ref = adminDb().collection(REMOVALS).doc(p.removalId);
  const pre = await ref.get();
  if (!pre.exists) return fail("not_found", 404);
  const blocked = canReview(pre.data() as { status: string; ground: string; respondBy: string; response: string | null }, Date.now());
  if (blocked) return fail(blocked, 409);

  const status = p.decision === "approve" ? "approved" : "rejected";
  try {
    await ledgerAppend(
      "REMOVAL_REVIEW",
      { removalId: p.removalId, decision: status, reasonHash: sha256Hex({ reason: p.reason }), reviewedBy: session.uid, signedHash },
      async (tx, rr) => {
        const doc = await tx.get(ref);
        if (doc.get("status") !== "proposed") throw new Refused("already_reviewed");
        tx.update(ref, { status, reviewReason: p.reason.trim(), reviewedBy: session.uid, reviewedAt: rr.createdAt, reviewSeq: rr.seq });
      },
    );
  } catch (err) {
    if (err instanceof Refused) return fail(err.code, 409);
    throw err;
  }
  audit(`removal.${status}`, session.uid, { removalId: p.removalId });

  const selectionId = pre.get("selectionId") as string;
  const sel = await getSelection(selectionId);
  if (status === "approved" && sel) {
    // Recompute the list without this athlete in this race: the next one moves up. Retry once if another change landed first.
    let out = await writeFinalList(selectionId, sel.finalVersion, { by: "tribunal-approved-removal", removalId: p.removalId });
    if (!out) {
      const again = await getSelection(selectionId);
      if (again) out = await writeFinalList(selectionId, again.finalVersion, { by: "tribunal-approved-removal", removalId: p.removalId });
    }
  }
  notify(pre.get("athleteId"), { kind: "removal_reviewed", selectionName: sel?.name ?? "the final list", race: pre.get("race"), approved: status === "approved", reason: p.reason.trim() }, appUrlFrom(req));
  return Response.json({ ok: true, status });
}
