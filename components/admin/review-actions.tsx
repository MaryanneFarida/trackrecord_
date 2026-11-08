"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { explain } from "@/lib/passkeys/client";

export function ReviewActions({ athleteUid, name }: { athleteUid: string; name: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(decision: "approve" | "reject") {
    const trimmed = reason.trim();
    if (decision === "reject" && trimmed.length < 5) return setMessage("Write a short reason so the athlete knows what to fix.");
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      await signedPost("/api/admin/athletes/decision", {
        action: "athlete.decision",
        athleteUid,
        decision,
        reason: decision === "reject" ? trimmed : "",
        at: new Date().toISOString(),
      });
      setMessage(decision === "approve" ? `${name} is verified as an athlete.` : `${name}'s application was returned.`);
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
        <Label htmlFor={`reason-${athleteUid}`}>Reason (needed only to reject)</Label>
        <Input id={`reason-${athleteUid}`} className="h-11 text-base" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button className="h-11 px-5 text-base" onClick={() => decide("approve")} disabled={busy}>
          Approve: ID matches selfie
        </Button>
        <Button variant="outline" className="h-11 px-5 text-base" onClick={() => decide("reject")} disabled={busy}>
          Reject
        </Button>
      </div>
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}
