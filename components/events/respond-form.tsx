"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { MIN_RESPONSE } from "@/lib/events/rules";
import { explainAction } from "./explain";

/** Athlete: answer an objection, once. Your answer is recorded next to it permanently. */
export function RespondForm({ objectionId }: { objectionId: string }) {
  const router = useRouter();
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (response.trim().length < MIN_RESPONSE) return setMessage(`Write at least ${MIN_RESPONSE} characters.`);
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      await signedPost("/api/objections/respond", {
        action: "objection.respond",
        objectionId,
        response: response.trim(),
        at: new Date().toISOString(),
      });
      setMessage("Your answer is recorded next to the objection.");
      router.refresh();
    } catch (err) {
      setMessage(explainAction(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`resp-${objectionId}`}>Your answer (you can answer once; the coach and tribunal will see it)</Label>
        <textarea id={`resp-${objectionId}`} rows={4} maxLength={1000} className="w-full rounded-md border bg-background p-3 text-base" value={response} onChange={(e) => setResponse(e.target.value)} />
      </div>
      <Button type="submit" className="min-h-11 px-5 text-base" disabled={busy}>Sign and send answer</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
