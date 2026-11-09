"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signedPost } from "@/lib/passkeys/signed";
import { explainAction } from "./explain";

/** Athlete: register yourself. If the rules allow it, you're in. Nobody approves it. */
export function RegisterForm({ eventId, eventName, races }: { eventId: string; eventName: string; races: string[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(races.length === 1 ? races : []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (chosen.length === 0) return setMessage("Choose at least one race.");
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      await signedPost("/api/registrations", {
        action: "registration.create",
        eventId,
        races: races.filter((r) => chosen.includes(r)),
        at: new Date().toISOString(),
      });
      setMessage(`You're on the start list for ${eventName}.`);
      router.refresh();
    } catch (err) {
      setMessage(explainAction(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={register} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Your races</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {races.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2 text-base">
              <input
                type="checkbox"
                className="size-5"
                checked={chosen.includes(r)}
                onChange={() => setChosen(chosen.includes(r) ? chosen.filter((c) => c !== r) : [...chosen, r])}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="min-h-12 w-full px-5 text-base sm:w-auto" disabled={busy}>Register for {eventName}</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
