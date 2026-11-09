"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTime } from "@/lib/schemas";
import { REMOVAL_GROUNDS } from "@/lib/selection/rules";
import { useSigned } from "./use-signed";

const area = "w-full rounded-md border bg-background p-3 text-base";

/** Admin: generate the final list from the published rules (once). */
export function GenerateButton({ selectionId, blockers }: { selectionId: string; blockers: string[] }) {
  const { busy, message, run } = useSigned();
  if (blockers.length > 0) {
    return (
      <div className="space-y-1 text-sm">
        <p className="font-medium">The final list can&apos;t be generated yet:</p>
        <ul className="list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button className="h-11 px-5 text-base" disabled={busy} onClick={() => run<{ ledgerSeq: number }>("/api/admin/selection/generate", { action: "selection.generate", selectionId }, (r) => `Final list generated: public record #${r.ledgerSeq}.`)}>
        Generate the final list
      </Button>
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}

/** Admin: PROPOSE a removal. Fixed reasons only, evidence required; the tribunal decides. */
export function ProposeRemoval(props: { selectionId: string; athleteId: string; athleteName: string; sportClass: string; race: string }) {
  const { busy, message, setMessage, run } = useSigned();
  const [ground, setGround] = useState("");
  const [evidenceRef, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const id = `${props.athleteId}-${props.race}`;
  const g = REMOVAL_GROUNDS.find((x) => x.code === ground);
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer content-center">Propose removal</summary>
      <form
        className="mt-2 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ground) return setMessage("Choose a reason.");
          await run("/api/removals/propose", { action: "removal.propose", selectionId: props.selectionId, athleteId: props.athleteId, sportClass: props.sportClass, race: props.race, ground, evidenceRef: evidenceRef.trim(), note: note.trim() }, () => `Proposed. ${props.athleteName} has been told and stays on the list until a tribunal member reviews it.`);
        }}
      >
        <p className="text-muted-foreground">Nothing changes yet: {props.athleteName} is told, can respond, and an independent tribunal member must approve it.</p>
        <div className="space-y-1.5">
          <Label htmlFor={`g-${id}`}>Reason (fixed list)</Label>
          <select id={`g-${id}`} className="h-11 w-full rounded-md border bg-background px-3 text-base" value={ground} onChange={(e) => setGround(e.target.value)}>
            <option value="">Choose a reason</option>
            {REMOVAL_GROUNDS.map((x) => <option key={x.code} value={x.code} disabled={!x.enabled}>{x.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`e-${id}`}>{g?.evidence ?? "Evidence reference"}</Label>
          <Input id={`e-${id}`} className="h-11" maxLength={120} value={evidenceRef} onChange={(e) => setEvidence(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`n-${id}`}>Explanation (public, at least 20 characters)</Label>
          <textarea id={`n-${id}`} rows={3} maxLength={1000} className={area} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" variant="destructive" className="h-11" disabled={busy}>Sign and propose</Button>
        <p role="status" aria-live="polite">{message}</p>
      </form>
    </details>
  );
}

/** Athlete: answer a proposed removal (once). */
export function RespondRemoval({ removalId }: { removalId: string }) {
  const { busy, message, setMessage, run } = useSigned();
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim().length < 10) return setMessage("Write at least 10 characters.");
        await run("/api/removals/respond", { action: "removal.respond", removalId, response: text.trim() }, () => "Your response is on the record. The tribunal will read it before deciding.");
      }}
    >
      <Label htmlFor={`r-${removalId}`}>Your response (the tribunal and the public will see it)</Label>
      <textarea id={`r-${removalId}`} rows={4} maxLength={1000} className={area} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" className="h-11" disabled={busy}>Sign and send</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}

/** Athlete: withdraw yourself (only you can). */
export function WithdrawButton(props: { selectionId: string; athleteId: string; sportClass: string; race: string }) {
  const { busy, message, run } = useSigned();
  const [sure, setSure] = useState(false);
  return (
    <div className="space-y-2 text-sm">
      {!sure ? (
        <Button variant="outline" className="h-11" onClick={() => setSure(true)}>Withdraw from {props.race}</Button>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          <p>This gives your place to the next athlete and can&apos;t be undone. Only you can do this.</p>
          <div className="flex gap-2">
            <Button variant="destructive" className="h-11" disabled={busy} onClick={() => run("/api/removals/withdraw", { action: "removal.withdraw", ...props }, () => "You have withdrawn. The next athlete has moved up.")}>Yes, withdraw</Button>
            <Button variant="outline" className="h-11" onClick={() => setSure(false)}>Keep my place</Button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}

/** Tribunal: approve or reject a proposed removal. */
export function ReviewRemoval({ removalId, ready }: { removalId: string; ready: boolean }) {
  const { busy, message, setMessage, run } = useSigned();
  const [reason, setReason] = useState("");
  const go = async (decision: "approve" | "reject") => {
    if (reason.trim().length < 20) return setMessage("Give a reason of at least 20 characters. It will be public.");
    await run<{ status: string }>("/api/removals/review", { action: "removal.review", removalId, decision, reason: reason.trim() }, (r) => (r.status === "approved" ? "Approved. The list has been recomputed and the next athlete moved up." : "Rejected. The athlete stays on the list."));
  };
  if (!ready) return <p className="text-sm text-muted-foreground">Waiting for the athlete&apos;s response or the end of their response window.</p>;
  return (
    <div className="space-y-2">
      <Label htmlFor={`rv-${removalId}`}>Your reason (public)</Label>
      <textarea id={`rv-${removalId}`} rows={3} maxLength={1000} className={area} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" className="h-11" disabled={busy} onClick={() => go("approve")}>Approve removal</Button>
        <Button className="h-11" disabled={busy} onClick={() => go("reject")}>Reject: athlete stays</Button>
      </div>
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}

/** Tribunal: decide the final time of a contested result. */
export function DecideResult(props: { eventId: string; race: string; athleteId: string }) {
  const { busy, message, setMessage, run } = useSigned();
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const id = `${props.eventId}-${props.race}-${props.athleteId}`;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const hundredths = parseTime(time);
        if (hundredths === null) return setMessage("Write the time like 12.48 or 1:52.07.");
        if (reason.trim().length < 20) return setMessage("Give a reason of at least 20 characters. It will be public.");
        await run<{ ledgerSeq: number }>("/api/tribunal/results", { action: "result.decide", ...props, hundredths, reason: reason.trim() }, (r) => `Decision recorded as public record #${r.ledgerSeq}.`);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`d-${id}`}>Final time</Label>
        <Input id={`d-${id}`} inputMode="decimal" className="h-11 w-36 font-mono text-lg" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`dr-${id}`}>Reason and evidence used (public)</Label>
        <textarea id={`dr-${id}`} rows={3} maxLength={1000} className={area} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <Button type="submit" className="h-11" disabled={busy}>Sign decision</Button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
