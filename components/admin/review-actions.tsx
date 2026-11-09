"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { explain } from "@/lib/passkeys/client";
import { REJECTION_REASONS } from "@/lib/athletes/schema";

export function ReviewActions({ athleteUid, name }: { athleteUid: string; name: string }) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(decision: "approve" | "reject") {
    const trimmed = note.trim();
    if (decision === "reject" && !reasonCode) return setMessage("Choose a reason from the list. The athlete will see it.");
    if (decision === "reject" && reasonCode === "other" && trimmed.length < 10) return setMessage("For \"Other\", explain the reason in the note.");
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      await signedPost("/api/admin/athletes/decision", {
        action: "athlete.decision",
        athleteUid,
        decision,
        reasonCode: decision === "reject" ? reasonCode : null,
        note: decision === "reject" ? trimmed : "",
        at: new Date().toISOString(),
      });
      setMessage(decision === "approve" ? `${name} is verified as an athlete.` : `${name}'s application was returned with your reason.`);
      router.refresh();
    } catch (err) {
      setMessage(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${athleteUid}`}>If rejecting: reason (the athlete sees this)</Label>
        <select
          id={`reason-${athleteUid}`}
          className="h-11 w-full rounded-md border bg-background px-3 text-base"
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
        >
          <option value="">Choose a reason</option>
          {REJECTION_REASONS.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`note-${athleteUid}`}>Note to the athlete (optional; required for &quot;Other&quot;)</Label>
        <Input id={`note-${athleteUid}`} className="h-11 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-11 px-5 text-base" onClick={() => decide("approve")} disabled={busy}>
          Approve: ID matches selfie
        </Button>
        <Button variant="outline" className="min-h-11 px-5 text-base" onClick={() => decide("reject")} disabled={busy}>
          Reject with this reason
        </Button>
      </div>
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}
