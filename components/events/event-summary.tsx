import { formatEAT } from "@/lib/events/rules";
import type { EventView } from "@/lib/events/server";

/** One qualifier's key facts and its lock status, the same for every role. */
export function EventSummary({ ev, intact }: { ev: EventView; intact?: boolean | null }) {
  return (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold">{ev.name}</h3>
      <p className="text-sm text-muted-foreground">
        {ev.venue} - first race {formatEAT(ev.raceStart)}
      </p>
      <p className="text-sm text-muted-foreground">Races: {ev.events.join(", ")} - classes: {ev.classes.join(", ")}</p>
      {ev.sealedAt ? (
        <p className="text-sm">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Sealed</span> {ev.count} athlete{ev.count === 1 ? "" : "s"}, ledger record #{ev.sealedSeq}
          {intact === false ? <strong className="ml-2 text-destructive" role="alert">The stored list no longer matches its seal. Report this to the tribunal.</strong> : null}
          {intact === true ? <span className="ml-2 text-muted-foreground">Matches its seal.</span> : null}
        </p>
      ) : (
        <p className="text-sm">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Open</span> Registration closes and the list seals at {formatEAT(ev.lockTime)}
        </p>
      )}
      {ev.ledgerSeq ? <p className="text-xs text-muted-foreground">Rules recorded as ledger record #{ev.ledgerSeq}</p> : null}
    </div>
  );
}
