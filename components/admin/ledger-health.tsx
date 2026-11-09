"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Result = { ok: boolean; checked: number; headSeq: number; problems: { seq: number; problem: string }[] };

const EXPLAIN: Record<string, string> = {
  hash_mismatch: "was changed after it was locked",
  bad_signature: "was not signed by TrackRecord's key",
  broken_link: "doesn't link to the record before it",
  missing_record: "is missing (deleted)",
  unknown_key: "was signed with an unknown key",
  head_mismatch: "is where the chain ends, but newer records were expected (records deleted from the end)",
  wrong_doc_id: "is stored under the wrong number",
};

export function LedgerHealth() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/ledger/verify", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError("The check couldn't run. Try again.");
    setResult(await res.json());
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Button className="min-h-11 px-5 text-base" onClick={check} disabled={busy}>
        {busy ? "Checking..." : "Verify the whole ledger now"}
      </Button>
      <div role="status" aria-live="polite">
        {error ? <p className="text-destructive">{error}</p> : null}
        {result?.ok ? (
          <p>
            <strong>Intact.</strong> All {result.checked} records checked: every fingerprint, signature and link is correct.
          </p>
        ) : null}
        {result && !result.ok ? (
          <div className="space-y-1 text-destructive">
            <p><strong>Tampering detected</strong> ({result.problems.length} problem{result.problems.length === 1 ? "" : "s"}):</p>
            <ul className="list-disc pl-6">
              {result.problems.slice(0, 20).map((p, i) => (
                <li key={i}>Record #{p.seq} {EXPLAIN[p.problem] ?? p.problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
