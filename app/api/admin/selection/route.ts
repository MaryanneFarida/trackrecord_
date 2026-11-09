import { adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { ledgerAppend } from "@/lib/ledger/server";
import { fail, signedRequest } from "@/lib/http/signed-route";
import { EVENTS_COLLECTION } from "@/lib/events/seal";
import { RESULTS } from "@/lib/results/server";
import { publishPayload, quotaKey } from "@/lib/selection/rules";
import { SELECTIONS } from "@/lib/selection/server";

/** Admin publishes the selection rules. They go into the public ledger and can never be edited. */
export async function POST(req: Request) {
  const r = await signedRequest(req, "admin", publishPayload);
  if (r instanceof Response) return r;
  const { session, p, signedHash } = r;
  if (p.name.trim().length < 3) return fail("bad_request");
  if (new Set(p.quotas.map((q) => quotaKey(q.sportClass, q.race))).size !== p.quotas.length) return fail("duplicate_quota");
  const db = adminDb();
  const ids = [...new Set(p.qualifierIds)];
  const events = await Promise.all(ids.map((id) => db.collection(EVENTS_COLLECTION).doc(id).get()));
  if (events.some((e) => !e.exists)) return fail("unknown_qualifier");
  const existing = await db.collection(RESULTS).where("eventId", "in", ids).get();
  if (existing.docs.some((d) => d.get("status") === "locked" || d.get("status") === "decided")) return fail("results_already_locked", 409); // rules must come before results

  const ref = db.collection(SELECTIONS).doc();
  const fields = { name: p.name.trim(), qualifierIds: ids, quotas: p.quotas };
  const rec = await ledgerAppend("SELECTION_RULES", { selectionId: ref.id, ...fields, publishedBy: session.uid, signedHash }, async (tx, rr) => {
    tx.create(ref, { ...fields, createdBy: session.uid, createdAt: rr.createdAt, ledgerSeq: rr.seq, signedHash, finalVersion: 0 });
  });
  audit("selection.published", session.uid, { selectionId: ref.id, ledgerSeq: rec.seq });
  return Response.json({ ok: true, selectionId: ref.id, ledgerSeq: rec.seq });
}
