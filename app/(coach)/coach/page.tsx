import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listEvents, startList, type EventView } from "@/lib/events/server";
import { categoryLabel, formatEAT } from "@/lib/events/rules";
import { EventSummary } from "@/components/events/event-summary";
import { StartListTable } from "@/components/events/start-list-table";
import { ObjectionForm } from "@/components/events/objection-form";

export const metadata = { title: "Coach" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("coach"); // every role page checks for itself, not just the layout
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Coach area</h1>
        <p className="text-muted-foreground">
          Athletes register themselves and the rules decide who is on a start list. If you believe an entry is wrong,
          you can object on the record. An objection never removes anyone: it goes to the athlete and the tribunal.
        </p>
      </div>
      <Suspense fallback={<p role="status">Loading start lists...</p>}>
        <Lists />
      </Suspense>
      <Suspense fallback={<p role="status">Loading your objections...</p>}>
        <MyObjections />
      </Suspense>
    </div>
  );
}

async function myObjections(uid: string) {
  const snap = await adminDb().collection("objections").where("createdBy", "==", uid).limit(100).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as { eventId: string; athleteId: string; reasonCategory: string; reason: string; createdAt: string; response: string | null; ledgerSeq: number }) }));
}

async function Lists() {
  const session = await requireRole("coach");
  const [events, mine] = await Promise.all([listEvents(), myObjections(session.uid)]);
  if (events.length === 0) return <p className="text-muted-foreground">No upcoming qualifiers.</p>;
  const objected = new Set(mine.map((o) => `${o.eventId}/${o.athleteId}`));
  return (
    <section aria-labelledby="lists" className="space-y-4">
      <h2 id="lists" className="text-xl font-semibold">Start lists</h2>
      {events.map((ev) => (
        <Suspense key={ev.id} fallback={<p>Loading {ev.name}...</p>}>
          <CoachEvent ev={ev} objected={objected} />
        </Suspense>
      ))}
    </section>
  );
}

async function CoachEvent({ ev, objected }: { ev: EventView; objected: Set<string> }) {
  await requireRole("coach");
  const rows = await startList(ev.id);
  return (
    <article className="space-y-3 rounded-lg border p-4" aria-label={ev.name}>
      <EventSummary ev={ev} />
      <StartListTable
        rows={rows}
        caption={`Start list for ${ev.name}`}
        action={(r) =>
          objected.has(`${ev.id}/${r.athleteId}`) ? (
            <span className="text-sm text-muted-foreground">You objected</span>
          ) : ev.raceStarted ? null : (
            <ObjectionForm eventId={ev.id} athleteId={r.athleteId} athleteName={r.fullName} />
          )
        }
      />
    </article>
  );
}

async function MyObjections() {
  const session = await requireRole("coach");
  const mine = (await myObjections(session.uid)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-labelledby="mine" className="space-y-4">
      <h2 id="mine" className="text-xl font-semibold">Your objections ({mine.length})</h2>
      <p className="text-sm text-muted-foreground">Every objection you raise stays on your record and is visible to the tribunal.</p>
      {mine.length === 0 ? <p className="text-muted-foreground">You haven&apos;t objected to any entry.</p> : null}
      <ul className="space-y-3">
        {mine.map((o) => (
          <li key={o.id} className="space-y-1 rounded-lg border p-3 text-sm">
            <p>
              <strong>{categoryLabel(o.reasonCategory)}</strong> - {formatEAT(o.createdAt)} - ledger record #{o.ledgerSeq}
            </p>
            <p>{o.reason}</p>
            <p className="text-muted-foreground">{o.response ? `Athlete's answer: ${o.response}` : "No answer from the athlete yet."}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
