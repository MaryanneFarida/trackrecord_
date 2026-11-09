import { adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { ledgerAppend } from "@/lib/ledger/server";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { withdrawPayload } from "@/lib/selection/rules";
import { REMOVALS, getSelection, writeFinalList } from "@/lib/selection/server";

/** Only the athlete can withdraw themselves, signed with their own passkey. It takes effect at once. */
export async function POST(req: Request) {
  const r = await signedRequest(req, "athlete", withdrawPayload);
  if (r instanceof Response) return r;
  const { session, p, signedHash } = r;
  if (p.athleteId !== session.uid) return fail("forbidden", 403);
  const sel = await getSelection(p.selectionId);
  if (!sel?.finalList) return fail("list_not_generated", 409);
  const quota = sel.finalList.find((q) => q.sportClass === p.sportClass && q.race === p.race);
  if (!quota?.ranking.some((x) => x.athleteId === p.athleteId)) return fail("not_on_list");

  const ref = adminDb().collection(REMOVALS).doc();
  const now = new Date().toISOString();
  const base = { selectionId: p.selectionId, athleteId: p.athleteId, sportClass: p.sportClass, race: p.race, ground: "voluntary", evidenceRef: "signed by the athlete" };
  await ledgerAppend("REMOVAL", { removalId: ref.id, ...base, proposedBy: session.uid, status: "approved", signedHash }, async (tx, rr) => {
    tx.create(ref, { ...base, note: "The athlete withdrew, signed with their own passkey.", proposedBy: session.uid, proposedAt: rr.createdAt, respondBy: now, status: "approved", response: null, ledgerSeq: rr.seq, signedHash });
  });
  let out = await writeFinalList(sel.id, sel.finalVersion, { by: "athlete-withdrawal", removalId: ref.id });
  if (!out) {
    const again = await getSelection(sel.id);
    if (again) out = await writeFinalList(sel.id, again.finalVersion, { by: "athlete-withdrawal", removalId: ref.id });
  }
  audit("removal.withdrawn", session.uid, { removalId: ref.id, selectionId: sel.id });
  return Response.json({ ok: true });
}
