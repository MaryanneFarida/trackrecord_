import { apiSession } from "@/lib/auth/api";
import { ledgerVerify } from "@/lib/ledger/server";
import { audit } from "@/lib/audit";

/** Admin: re-check every stored ledger record right now. Read-only. Phase 8 also runs this daily. */
export async function POST(req: Request) {
  const session = await apiSession(req, "admin");
  if (session instanceof Response) return session;
  const result = await ledgerVerify();
  audit("ledger.verified", session.uid, { ok: result.ok, checked: result.checked, problems: result.problems.length });
  return Response.json(result);
}
