import { maskEmail } from "@/lib/privacy";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { athletePhotos, listPendingAthletes } from "@/lib/athletes/admin";
import { SPORT_CLASSES } from "@/lib/athletes/schema";
import { ROLE_LABELS, isRole } from "@/lib/auth/roles";
import { ReviewActions } from "@/components/admin/review-actions";
import { InviteForm } from "@/components/admin/invite-form";
import { LedgerHealth } from "@/components/admin/ledger-health";
import { EventForm } from "@/components/events/event-form";
import { EventSummary } from "@/components/events/event-summary";
import { StartListTable } from "@/components/events/start-list-table";
import { listEvents, listIntact, startList, type EventView } from "@/lib/events/server";
import Link from "next/link";
import { formatEAT } from "@/lib/events/rules";
import { PublishSelectionForm } from "@/components/selection/publish-form";
import { GenerateButton, ProposeRemoval } from "@/components/selection/actions";
import { readiness } from "@/lib/selection/rules";
import { athleteNames, listSelections, qualifierStates, type Selection } from "@/lib/selection/server";
import { Hero, JumpLinks, Stat, Stats } from "@/components/dash/parts";
import { firstName } from "@/lib/auth/display-name";
import { formatTime } from "@/lib/schemas";

export const metadata = { title: "Federation admin" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const session = await requireRole("admin"); // every role page checks for itself, not just the layout
  const name = await firstName(session.uid, "admin");
  return (
    <div className="tr-dash space-y-6">
      <Hero
        image="hero-admin"
        art="finish"
        eyebrow="Admin"
        title={name ? `Welcome back, ${name}` : "Welcome back"}
        subtitle="You set the stage: verify athletes, create qualifiers and publish the rules. The rules then decide, and every step is on the public record."
      >
        <JumpLinks
          links={[
            { href: "#pending", label: "Applications" },
            { href: "#events", label: "Qualifiers" },
            { href: "#selection", label: "Selection" },
            { href: "#invites", label: "Invites" },
            { href: "#ledger", label: "Ledger health" },
          ]}
        />
      </Hero>
      <Suspense fallback={<p role="status">Loading your numbers...</p>}>
        <AdminStats />
      </Suspense>
      <Suspense fallback={<p role="status">Loading applications...</p>}>
        <PendingAthletes />
      </Suspense>
      <section aria-labelledby="events" className="space-y-4">
        <h2 id="events" className="text-xl font-semibold">Qualifiers</h2>
        <p className="text-muted-foreground">
          Athletes register themselves; the rules decide. Each start list seals itself 24 hours before the race.
        </p>
        <EventForm />
        <Suspense fallback={<p role="status">Loading qualifiers...</p>}>
          <Events />
        </Suspense>
      </section>
      <section aria-labelledby="selection" className="space-y-4">
        <h2 id="selection" className="text-xl font-semibold">Selection</h2>
        <p className="text-muted-foreground">
          Publish the rules before results count. The final list is generated from them; you can only PROPOSE a removal,
          and an independent tribunal member decides.
        </p>
        <Suspense fallback={<p role="status">Loading selections...</p>}>
          <Selections />
        </Suspense>
      </section>
      <section aria-labelledby="ledger" className="space-y-4">
        <h2 id="ledger" className="text-xl font-semibold">Ledger health</h2>
        <p className="text-muted-foreground">
          Every locked result, objection and removal is a signed, chained record. This re-checks all of them.
        </p>
        <LedgerHealth />
      </section>
      <section aria-labelledby="invites" className="space-y-4">
        <h2 id="invites" className="text-xl font-semibold">Invite a coach, official, doctor or tribunal member</h2>
        <InviteForm />
        <Suspense fallback={<p role="status">Loading invites...</p>}>
          <RecentInvites />
        </Suspense>
      </section>
    </div>
  );
}

async function PendingAthletes() {
  await requireRole("admin");
  const pending = await listPendingAthletes();
  return (
    <section aria-labelledby="pending" className="space-y-4">
      <h2 id="pending" className="text-xl font-semibold">Athletes waiting for verification ({pending.length})</h2>
      {pending.length === 0 ? <p className="text-muted-foreground">No applications waiting.</p> : null}
      {pending.map((a) => (
        <Suspense key={a.uid} fallback={<p>Loading {a.fullName}...</p>}>
          <ReviewCard athlete={a} />
        </Suspense>
      ))}
    </section>
  );
}

async function ReviewCard({ athlete: a }: { athlete: Awaited<ReturnType<typeof listPendingAthletes>>[number] }) {
  await requireRole("admin");
  const photos = await athletePhotos(a.uid);
  const cls = SPORT_CLASSES.find((c) => c.code === a.sportClass)?.label ?? a.sportClass;
  return (
    <article className="space-y-3 rounded-lg border p-4" aria-label={`Application from ${a.fullName}`}>
      <div>
        <h3 className="text-lg font-semibold">{a.fullName}</h3>
        <p className="text-sm text-muted-foreground">
          Licence {a.licenceNo} - {cls} - {a.events.join(", ")}
          {a.guideRunner ? " - races with a guide" : ""} - applied {a.submittedAt.slice(0, 10)}
        </p>
      </div>
      {photos ? (
        <div className="grid grid-cols-2 gap-3">
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.idPhoto} alt={`ID document of ${a.fullName}`} className="w-full rounded-md border" />
            <figcaption className="text-sm">ID document</figcaption>
          </figure>
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.selfie} alt={`Selfie of ${a.fullName}`} className="w-full rounded-md border" />
            <figcaption className="text-sm">Selfie</figcaption>
          </figure>
        </div>
      ) : (
        <p role="alert" className="text-destructive">The photos couldn&apos;t be decrypted. They may have been altered. Reject and ask for a new application.</p>
      )}
      <ReviewActions athleteUid={a.uid} name={a.fullName} />
    </article>
  );
}

async function RecentInvites() {
  await requireRole("admin");
  const snap = await adminDb().collection("invites").orderBy("createdAt", "desc").limit(15).get();
  if (snap.empty) return <p className="text-muted-foreground">No invites yet.</p>;
  const now = new Date().toISOString();
  return (
    <ul className="divide-y rounded-lg border" aria-label="Recent invites">
      {snap.docs.map((d) => {
        const v = d.data();
        const status = v.usedBy ? `used ${String(v.usedAt).slice(0, 10)}` : v.expiresAt < now ? "expired" : `open until ${String(v.expiresAt).slice(0, 10)}`;
        return (
          <li key={d.id} className="p-3 text-sm">
            <strong>{isRole(v.role) ? ROLE_LABELS[v.role] : v.role}</strong>
            {v.email ? ` for ${maskEmail(v.email)}` : " (any email)"}
            {v.note ? ` - ${v.note}` : ""} - {status}
          </li>
        );
      })}
    </ul>
  );
}

async function Events() {
  await requireRole("admin");
  const events = await listEvents();
  if (events.length === 0) return <p className="text-muted-foreground">No upcoming qualifiers.</p>;
  return (
    <div className="space-y-4">
      {events.map((ev) => (
        <Suspense key={ev.id} fallback={<p>Loading {ev.name}...</p>}>
          <AdminEvent ev={ev} />
        </Suspense>
      ))}
    </div>
  );
}

async function AdminEvent({ ev }: { ev: EventView }) {
  await requireRole("admin");
  const [rows, intact] = await Promise.all([startList(ev.id), listIntact(ev)]);
  return (
    <article className="space-y-3 rounded-lg border p-4" aria-label={ev.name}>
      <EventSummary ev={ev} intact={intact} />
      <details>
        <summary className="min-h-11 cursor-pointer content-center">Start list ({rows.length})</summary>
        <StartListTable rows={rows} caption={`Start list for ${ev.name}`} />
      </details>
    </article>
  );
}

async function Selections() {
  await requireRole("admin");
  const [events, selections] = await Promise.all([listEvents(), listSelections()]);
  return (
    <div className="space-y-4">
      <details className="rounded-lg border p-4">
        <summary className="min-h-11 cursor-pointer content-center font-medium">Publish new selection rules</summary>
        <div className="mt-3">
          <PublishSelectionForm qualifiers={events.map((e) => ({ id: e.id, name: e.name, when: formatEAT(e.raceStart) }))} />
        </div>
      </details>
      {selections.map((sel) => (
        <Suspense key={sel.id} fallback={<p>Loading {sel.name}...</p>}>
          <AdminSelection sel={sel} />
        </Suspense>
      ))}
    </div>
  );
}

async function AdminSelection({ sel }: { sel: Selection }) {
  await requireRole("admin");
  const states = sel.finalList ? [] : await qualifierStates(sel.qualifierIds);
  const names = sel.finalList ? await athleteNames(sel.finalList.flatMap((q) => q.ranking.map((r) => r.athleteId))) : new Map<string, string>();
  return (
    <article className="space-y-3 rounded-lg border p-4" aria-label={sel.name}>
      <h3 className="text-lg font-semibold">{sel.name}</h3>
      <p className="text-sm">
        {sel.quotas.map((q) => `${q.sportClass} ${q.race} (${q.places})`).join(", ")} - rules record #{sel.ledgerSeq} -{" "}
        <Link href={`/selection/${sel.id}`} className="underline underline-offset-2">public page</Link>
      </p>
      {!sel.finalList ? (
        <GenerateButton selectionId={sel.id} blockers={readiness(states).blockers} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm">Final list version {sel.finalVersion}, record #{sel.finalListSeq}.</p>
          {sel.finalList.map((q) => (
            <div key={`${q.sportClass}-${q.race}`} className="space-y-2">
              <p className="font-medium">{q.sportClass} {q.race}</p>
              <ul className="space-y-2">
                {q.ranking.map((r) => (
                  <li key={r.athleteId} className="space-y-1 rounded-md border p-2">
                    <p>
                      #{r.rank} {names.get(r.athleteId) ?? "Athlete"} - {formatTime(r.best)} - {r.status}
                    </p>
                    <ProposeRemoval selectionId={sel.id} athleteId={r.athleteId} athleteName={names.get(r.athleteId) ?? "the athlete"} sportClass={q.sportClass} race={q.race} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

async function AdminStats() {
  await requireRole("admin");
  const [pending, events, selections, ledger] = await Promise.all([
    listPendingAthletes(),
    listEvents(),
    listSelections(),
    adminDb().doc("ledgerHead/head").get(),
  ]);
  return (
    <Stats>
      <Stat tone="feature" label="Applications waiting" value={pending.length} hint="Athletes to verify" />
      <Stat tone="peach" label="Qualifiers" value={events.length} hint={`${events.filter((e) => e.registrationOpen).length} open for registration`} />
      <Stat tone="sage" label="Selections" value={selections.length} hint={`${selections.filter((s) => s.finalList).length} final list(s) generated`} />
      <Stat tone="plain" label="Public records" value={(ledger.get("seq") as number | undefined) ?? 0} hint="In the tamper-evident ledger" />
    </Stats>
  );
}
