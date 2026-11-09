import { audit } from "@/lib/audit";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { generatePayload, readiness } from "@/lib/selection/rules";
import { getSelection, qualifierStates, writeFinalList } from "@/lib/selection/server";

/** Admin generates the final list, once. Only possible when no result is still open. */
export async function POST(req: Request) {
  const r = await signedRequest(req, "admin", generatePayload);
  if (r instanceof Response) return r;
  const { session, p } = r;
  const sel = await getSelection(p.selectionId);
  if (!sel) return fail("not_found", 404);
  if (sel.finalVersion > 0) return fail("already_generated", 409);
  const ready = readiness(await qualifierStates(sel.qualifierIds));
  if (!ready.ready) return Response.json({ error: "not_ready", blockers: ready.blockers }, { status: 409 });
  const out = await writeFinalList(sel.id, 0, { by: session.uid });
  if (!out) return fail("already_generated", 409);
  audit("selection.generated", session.uid, { selectionId: sel.id, ledgerSeq: out.seq });
  return Response.json({ ok: true, ledgerSeq: out.seq });
}
