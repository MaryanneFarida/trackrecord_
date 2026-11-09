import Link from "next/link";
import { formatTime } from "@/lib/schemas";
import { formatEAT } from "@/lib/events/rules";
import { groundLabel } from "@/lib/selection/rules";
import type { Journey, Stop } from "@/lib/selection/journey";
import { RespondRemoval, WithdrawButton } from "./actions";

const STOP_TEXT: Record<Stop["state"], string> = {
  not_entered: "Not entered",
  registered: "Registered",
  checked_in: "Checked in",
  locked: "Locked",
  contested: "Contested: with the tribunal",
  decided: "Decided by the tribunal",
};

function dot(s: Stop) {
  if (s.state === "locked" || s.state === "decided") return "bg-primary text-primary-foreground border-primary";
  if (s.state === "contested") return "bg-amber-100 text-amber-900 border-amber-500 dark:bg-amber-950 dark:text-amber-100";
  if (s.state === "not_entered") return "bg-background text-muted-foreground border-dashed";
  return "bg-muted text-foreground border-foreground/40";
}

/**
 * The road to selection, like a tournament bracket: each qualifier is a stop,
 * the best locked time is marked, and the path ends at the final list.
 */
export function JourneyView({ j, uid }: { j: Journey; uid: string }) {
  const done = j.final.kind === "selected" || j.final.kind === "reserve" || j.final.kind === "removed";
  const finalTone =
    j.final.kind === "selected"
      ? "border-primary bg-primary text-primary-foreground"
      : j.final.kind === "removed"
        ? "border-destructive bg-destructive/10"
        : j.final.kind === "reserve"
          ? "border-foreground/40 bg-muted"
          : "border-dashed";

  return (
    <article className="space-y-4 rounded-xl border p-4" aria-label={`Road to ${j.selection.name}, ${j.sportClass} ${j.race}`}>
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Road to selection</p>
        <h3 className="text-xl font-semibold">{j.selection.name}</h3>
        <p className="text-sm">
          {j.sportClass} {j.race} - {j.places} place{j.places === 1 ? "" : "s"}, decided by best locked time.{" "}
          <Link href={`/selection/${j.selection.id}`} className="underline underline-offset-4">See the whole list</Link>
        </p>
      </header>

      <ol className="relative flex flex-col gap-4 md:flex-row md:items-stretch md:gap-0">
        {j.stops.map((s, i) => (
          <li key={s.eventId} className="relative flex gap-3 md:flex-1 md:flex-col md:items-center md:gap-2 md:px-2 md:text-center">
            {/* connector line to the next stop */}
            <span aria-hidden="true" className="absolute left-5 top-10 h-[calc(100%-1rem)] w-0.5 bg-border md:left-1/2 md:top-5 md:h-0.5 md:w-full" />
            <span className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ${dot(s)}`}>{i + 1}</span>
            <div className="relative z-10 space-y-0.5 rounded-lg bg-background md:px-1">
              <p className="font-medium leading-tight">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.raceStart ? formatEAT(s.raceStart) : ""}</p>
              {s.hundredths !== null ? (
                <p className="font-mono text-lg font-semibold">
                  {formatTime(s.hundredths)}
                  {s.best ? <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 align-middle font-sans text-xs text-primary">best: counts</span> : null}
                </p>
              ) : null}
              <p className="text-xs">
                {s.seq ? (
                  <Link href={`/verify/${s.seq}`} className="underline underline-offset-2">{STOP_TEXT[s.state]}</Link>
                ) : (
                  STOP_TEXT[s.state]
                )}
              </p>
            </div>
          </li>
        ))}
        <li className="relative flex gap-3 md:flex-1 md:flex-col md:items-center md:gap-2 md:px-2 md:text-center">
          <span aria-hidden="true" className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-lg ${finalTone}`}>
            {j.final.kind === "selected" ? "\u2605" : j.final.kind === "removed" ? "!" : "\u2691"}
          </span>
          <div className={`relative z-10 w-full rounded-lg border-2 p-3 ${finalTone}`}>
            <p className="text-xs uppercase tracking-wide opacity-80">Final list</p>
            {j.final.kind === "selected" ? (
              <>
                <p className="text-xl font-bold">Selected: #{j.final.rank}</p>
                <Link href={`/verify/${j.final.seq}`} className="text-sm underline underline-offset-2">Proof: public record #{j.final.seq}</Link>
              </>
            ) : j.final.kind === "reserve" ? (
              <>
                <p className="text-lg font-semibold">Reserve: #{j.final.rank} of {j.final.of}</p>
                <p className="text-sm">You move up automatically if anyone above you leaves the list.</p>
              </>
            ) : j.final.kind === "removed" ? (
              <>
                <p className="text-lg font-semibold">Removed</p>
                <p className="text-sm">{j.final.removal ? groundLabel(j.final.removal.ground) : ""}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">{j.final.rank ? `Currently #${j.final.rank} of ${j.final.of}` : "No locked time yet"}</p>
                <p className="text-sm">{j.final.rank && j.final.rank <= j.places ? "On course for selection." : "The list is generated when every result is in."}</p>
              </>
            )}
          </div>
        </li>
      </ol>

      {j.removals.map((r) => (
        <div key={r.id} className="space-y-2 rounded-lg border-2 border-destructive/40 p-3">
          <p className="font-semibold">
            {r.ground === "voluntary" ? "You withdrew" : r.status === "proposed" ? "A removal has been PROPOSED. You are still on the list." : r.status === "approved" ? "Removal approved by the tribunal" : "Removal rejected by the tribunal: you stay"}
          </p>
          {r.ground !== "voluntary" ? (
            <>
              <p className="text-sm">Reason: {groundLabel(r.ground)} (evidence: {r.evidenceRef})</p>
              <p className="text-sm">{r.note}</p>
              {r.reviewReason ? <p className="text-sm">Tribunal&apos;s reason: {r.reviewReason}</p> : null}
              {r.status === "proposed" && r.response === null ? (
                <>
                  <p className="text-sm">You can respond until {formatEAT(r.respondBy)}. An independent tribunal member reads your response before deciding.</p>
                  <RespondRemoval removalId={r.id} />
                </>
              ) : r.response ? (
                <p className="text-sm">Your response: {r.response}</p>
              ) : null}
            </>
          ) : null}
          <Link href={`/verify/${r.ledgerSeq}`} className="text-sm underline underline-offset-2">Public record #{r.ledgerSeq}</Link>
        </div>
      ))}

      {done && j.final.kind !== "removed" ? <WithdrawButton selectionId={j.selection.id} athleteId={uid} sportClass={j.sportClass} race={j.race} /> : null}
    </article>
  );
}
