"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { MIN_REASON, OBJECTION_CATEGORIES } from "@/lib/events/rules";
import { explainAction } from "./explain";

/** Coach: object on the record. The athlete stays on the list and is told. */
export function ObjectionForm({ eventId, athleteId, athleteName }: { eventId: string; athleteId: string; athleteName: string }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const id = `${eventId}-${athleteId}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return setMessage("Choose a category.");
    if (reason.trim().length < MIN_REASON) return setMessage(`Give a reason of at least ${MIN_REASON} characters.`);
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      await signedPost("/api/objections", {
        action: "objection.create",
        eventId,
        athleteId,
        category,
        reason: reason.trim(),
        at: new Date().toISOString(),
      });
      setMessage(`Objection recorded. ${athleteName} has been told and stays on the list.`);
      router.refresh();
    } catch (err) {
      setMessage(explainAction(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="min-h-11 cursor-pointer content-center">Object to {athleteName}&apos;s entry</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          An objection does not remove anyone. It is signed by you, permanently recorded, shown to {athleteName}, and visible to the tribunal.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`cat-${id}`}>Category</Label>
          <select id={`cat-${id}`} className="h-11 w-full rounded-md border bg-background px-3 text-base" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose a category</option>
            {OBJECTION_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`reason-${id}`}>Reason (at least {MIN_REASON} characters; the athlete reads this)</Label>
          <textarea id={`reason-${id}`} rows={4} maxLength={1000} className="w-full rounded-md border bg-background p-3 text-base" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="submit" variant="destructive" className="h-11 px-5 text-base" disabled={busy}>Sign and record objection</Button>
        <p role="status" aria-live="polite">{message}</p>
      </form>
    </details>
  );
}
