import { adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { serverEnv } from "@/lib/env";
import { notify, appUrlFrom } from "@/lib/notify";
import { ledgerAppend } from "@/lib/ledger/server";
import { sha256Hex } from "@/lib/ledger/hash";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { groundLabel, proposePayload } from "@/lib/selection/rules";
import { REMOVALS, getSelection } from "@/lib/selection/server";

/**
 * Admin PROPOSES a removal: only for a reason on the fixed list, with an evidence
 * reference. Nothing happens to the athlete yet: they are told, can respond, and
 * an independent tribunal member must co-sign before it takes effect.
 */
export async function POST(req: Request) {
  const r = await signedRequest(req, "admin", proposePayload);
  if (r instanceof Response) return r;
  const { session, p, signedHash } = r;
  if (p.evidenceRef.trim().length < 3) return fail("evidence_required");
  if (p.note.trim().length < 20) return fail("note_too_short");
  const sel = await getSelection(p.selectionId);
  if (!sel?.finalList) return fail("list_not_generated", 409);
  const quota = sel.finalList.find((q) => q.sportClass === p.sportClass && q.race === p.race);
  if (!quota?.ranking.some((x) => x.athleteId === p.athleteId)) return fail("not_on_list");

  const db = adminDb();
  const open = await db.collection(REMOVALS).where("selectionId", "==", p.selectionId).where("athleteId", "==", p.athleteId).get();
  if (open.docs.some((d) => d.get("race") === p.race && d.get("sportClass") === p.sportClass && d.get("status") !== "rejected")) return fail("already_proposed", 409);

  const ref = db.collection(REMOVALS).doc();
  const respondBy = new Date(Date.now() + serverEnv().REMOVAL_RESPONSE_MINUTES * 60_000).toISOString();
  const base = { selectionId: p.selectionId, athleteId: p.athleteId, sportClass: p.sportClass, race: p.race, ground: p.ground, evidenceRef: p.evidenceRef.trim() };
  const rec = await ledgerAppend(
    "REMOVAL",
    { removalId: ref.id, ...base, noteHash: sha256Hex({ note: p.note }), proposedBy: session.uid, respondBy, status: "proposed", signedHash },
    async (tx, rr) => {
      tx.create(ref, { ...base, note: p.note.trim(), proposedBy: session.uid, proposedAt: rr.createdAt, respondBy, status: "proposed", response: null, ledgerSeq: rr.seq, signedHash });
    },
  );
  audit("removal.proposed", session.uid, { removalId: ref.id, athleteId: p.athleteId, ground: p.ground, ledgerSeq: rec.seq });
  notify(p.athleteId, { kind: "removal_proposed", selectionName: sel.name, race: p.race, ground: groundLabel(p.ground), respondBy }, appUrlFrom(req));
  return Response.json({ ok: true, removalId: ref.id, ledgerSeq: rec.seq });
}
