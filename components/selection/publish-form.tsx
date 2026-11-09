"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENTS, OFFERED_CLASSES as SPORT_CLASSES } from "@/lib/athletes/schema";
import { useSigned } from "./use-signed";

const select = "h-11 rounded-md border bg-background px-3 text-base";

/** Admin: publish the selection rules before results count. They can never be edited. */
export function PublishSelectionForm({ qualifiers }: { qualifiers: { id: string; name: string; when: string }[] }) {
  const { busy, message, setMessage, run } = useSigned();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [quotas, setQuotas] = useState([{ sportClass: "T12", race: "400m", places: 3 }]);

  const update = (i: number, patch: Partial<(typeof quotas)[number]>) => setQuotas(quotas.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) return setMessage("Give the team a name.");
    if (chosen.length === 0) return setMessage("Choose at least one qualifier that counts.");
    await run<{ ledgerSeq: number }>(
      "/api/admin/selection",
      { action: "selection.publish", name: name.trim(), qualifierIds: qualifiers.map((q) => q.id).filter((id) => chosen.includes(id)), quotas },
      (res) => `Rules published as public record #${res.ledgerSeq}. They can't be changed now.`,
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="sel-name">Team or selection name</Label>
        <Input id="sel-name" className="h-11 text-base" placeholder="Kenya Para Athletics Team 2027" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Qualifiers that count</legend>
        {qualifiers.length === 0 ? <p className="text-sm text-muted-foreground">Create qualifiers first.</p> : null}
        {qualifiers.map((q) => (
          <label key={q.id} className="flex min-h-11 items-center gap-2 text-base">
            <input type="checkbox" className="size-5" checked={chosen.includes(q.id)} onChange={() => setChosen(chosen.includes(q.id) ? chosen.filter((c) => c !== q.id) : [...chosen, q.id])} />
            {q.name} <span className="text-sm text-muted-foreground">({q.when})</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Places per class and race (fastest best time wins)</legend>
        {quotas.map((q, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <select aria-label="Sport class" className={select} value={q.sportClass} onChange={(e) => update(i, { sportClass: e.target.value })}>
              {SPORT_CLASSES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <select aria-label="Race" className={select} value={q.race} onChange={(e) => update(i, { race: e.target.value })}>
              {EVENTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Input aria-label="Places" type="number" min={1} max={20} className="h-11 w-24" value={q.places} onChange={(e) => update(i, { places: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
            <span className="pb-3 text-sm">places</span>
            {quotas.length > 1 ? <Button type="button" variant="outline" className="min-h-11" onClick={() => setQuotas(quotas.filter((_, j) => j !== i))}>Remove</Button> : null}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setQuotas([...quotas, { sportClass: "T12", race: "100m", places: 3 }])}>Add a class and race</Button>
      </fieldset>
      <p className="text-sm text-muted-foreground">Publish before any of these qualifiers has a locked result. Once published, nobody can change the rules.</p>
      <Button type="submit" className="min-h-11 px-5 text-base" disabled={busy}>Sign and publish rules</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
