"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { explain } from "@/lib/passkeys/client";
import { parseTime } from "@/lib/schemas";
import { RESULT_MESSAGES } from "@/lib/results/rules";
import { RULE_MESSAGES } from "@/lib/events/rules";

/** Enter a time, signed. It can't be changed afterwards, so the form asks you to check it first. */
export function ResultForm({ eventId, race, athleteId, label }: { eventId: string; race: string; athleteId: string; label: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const id = `t-${eventId}-${race}-${athleteId}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const hundredths = parseTime(text);
    if (hundredths === null) return setMessage(RESULT_MESSAGES.bad_time);
    setBusy(true);
    setMessage("Check the time, then confirm with your passkey. A signed time can't be changed.");
    try {
      const res = await signedPost<{ status: string; seq: number | null; time: string }>("/api/results", {
        action: "result.enter",
        eventId,
        race,
        athleteId,
        hundredths,
        at: new Date().toISOString(),
      });
      setMessage(
        res.status === "locked"
          ? `Both times match: ${res.time} is locked in ledger record #${res.seq}.`
          : res.status === "contested"
            ? `The two times don't match. Both are on the record (ledger #${res.seq}) and the tribunal will decide.`
            : `Your time ${res.time} is signed. Waiting for the other side to enter theirs.`,
      );
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setMessage(RESULT_MESSAGES[code] ?? RULE_MESSAGES[code] ?? explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} inputMode="decimal" placeholder="52.31" className="h-11 w-36 font-mono text-lg" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Button type="submit" className="min-h-11" disabled={busy}>Sign time</Button>
      <p role="status" aria-live="polite" className="w-full text-sm">{message}</p>
    </form>
  );
}
