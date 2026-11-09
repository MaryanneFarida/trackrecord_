"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAsJudge } from "@/lib/auth/client";

const ROLES = [
  { role: "athlete", title: "Athlete", who: "Amani Wanjiru, T54", what: "Register, show a check-in code, sign a time, follow the road to selection" },
  { role: "coach", title: "Coach", who: "Coach Otieno", what: "See start lists, object on the record, sign athletes' times" },
  { role: "official", title: "Venue official", who: "Official Achieng", what: "Scan a check-in code and do the face check" },
  { role: "tribunal", title: "Tribunal", who: "Njeri, independent reviewer", what: "Decide contested results and proposed removals" },
  { role: "admin", title: "Admin", who: "Admin Demo", what: "Verify athletes, create qualifiers, publish selection rules" },
] as const;

/** Judges pick a demo role and enter the access code they were given. */
export function JudgeLogin() {
  const [code, setCode] = useState("");
  const [role, setRole] = useState<string>("athlete");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setMessage("Enter the access code you were given.");
    setBusy(true);
    setMessage("Signing you in...");
    try {
      window.location.assign(await signInAsJudge(code, role));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={go} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Choose who you want to be</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <label key={r.role} className={`flex min-h-20 cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${role === r.role ? "border-primary bg-secondary" : "bg-card hover:border-sage"}`}>
              <input type="radio" name="role" value={r.role} checked={role === r.role} onChange={() => setRole(r.role)} className="mt-1 size-5" />
              <span>
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-sm text-muted-foreground">{r.who}</span>
                <span className="mt-1 block text-sm">{r.what}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="judge-code">Access code</Label>
        <Input id="judge-code" autoComplete="off" className="h-12 text-base" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>Enter TrackRecord</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
