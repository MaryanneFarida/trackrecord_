"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { EVENTS, OFFERED_CLASSES as SPORT_CLASSES } from "@/lib/athletes/schema";
import { explainAction } from "./explain";

/** Admin: create a qualifier. The start list will seal itself 24 hours before the race. */
export function EventForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [start, setStart] = useState("");
  const [races, setRaces] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const lockPreview = start ? new Date(new Date(start).getTime() - 24 * 3600 * 1000).toLocaleString() : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !venue.trim() || !start) return setMessage("Fill in the name, venue and race start.");
    if (races.length === 0 || classes.length === 0) return setMessage("Choose at least one race and one class.");
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      const res = await signedPost<{ ledgerSeq: number }>("/api/admin/events", {
        action: "event.create",
        name: name.trim(),
        venue: venue.trim(),
        raceStart: new Date(start).toISOString(), // the browser's local time (EAT in Kenya) to UTC
        races: EVENTS.filter((r) => races.includes(r)),
        classes: SPORT_CLASSES.map((c) => c.code).filter((c) => classes.includes(c)),
        at: new Date().toISOString(),
      });
      setMessage(`Qualifier created and recorded as public ledger record #${res.ledgerSeq}. Athletes can register now.`);
      setName("");
      setVenue("");
      setStart("");
      setRaces([]);
      setClasses([]);
      router.refresh();
    } catch (err) {
      setMessage(explainAction(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="ev-name">Name</Label>
        <Input id="ev-name" className="h-11 text-base" placeholder="Nakuru Para Athletics Qualifier" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-venue">Venue</Label>
        <Input id="ev-venue" className="h-11 text-base" placeholder="Afraha Stadium, Nakuru" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ev-start">First race starts (your local time)</Label>
        <Input id="ev-start" type="datetime-local" className="h-11 text-base" value={start} onChange={(e) => setStart(e.target.value)} />
        <p className="text-sm text-muted-foreground">
          {lockPreview ? `The start list will seal automatically at ${lockPreview}.` : "The start list seals automatically 24 hours before this."}
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Races</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {EVENTS.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2 text-base">
              <input type="checkbox" className="size-5" checked={races.includes(r)} onChange={() => toggle(races, setRaces, r)} />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Sport classes on the programme</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SPORT_CLASSES.map((c) => (
            <label key={c.code} className="flex min-h-11 items-center gap-2 text-base" title={c.label}>
              <input type="checkbox" className="size-5" checked={classes.includes(c.code)} onChange={() => toggle(classes, setClasses, c.code)} />
              {c.code}
            </label>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setClasses(classes.length === SPORT_CLASSES.length ? [] : SPORT_CLASSES.map((c) => c.code))}>
          {classes.length === SPORT_CLASSES.length ? "Clear all classes" : "Select all classes"}
        </Button>
      </fieldset>
      <Button type="submit" className="h-11 px-5 text-base" disabled={busy}>Create qualifier</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
