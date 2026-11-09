import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listEvents, type EventView } from "@/lib/events/server";
import { categoryLabel, formatEAT } from "@/lib/events/rules";
import { startListPath } from "@/lib/events/seal";
import { EventSummary } from "@/components/events/event-summary";
import { RegisterForm } from "@/components/events/register-form";
import { RespondForm } from "@/components/events/respond-form";
import { MyCheckInCode } from "@/components/checkin/my-code";
import { ResultForm } from "@/components/results/result-form";
import { ResultStatus } from "@/components/results/result-status";
import { ENTRIES, RESULTS, type ResultDoc } from "@/lib/results/server";
import { entryId, resultId } from "@/lib/results/rules";
import { CHECKIN_STATUS } from "@/lib/checkin/summary";
import { statusId } from "@/lib/checkin/rules";
import { formatTime } from "@/lib/schemas";
import { journeysFor } from "@/lib/selection/journey";
import { JourneyView } from "@/components/selection/journey";
import { Hero, JumpLinks, Stat, Stats } from "@/components/dash/parts";
import { VerifiedSeal } from "@/components/dash/verified";
import { athletePhotos } from "@/lib/athletes/admin";

export const metadata = { title: "Athlete" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

interface Profile {
  fullName: string;
  sportClass: string;
  events: string[];
  status: string;
}

async function Content() {
  const session = await requireRole("athlete"); // every role page checks for itself, not just the layout
  const doc = await adminDb().collection("athletes").doc(session.uid).get();
  const profile = doc.exists ? (doc.data() as Profile) : null;
  const photos = await athletePhotos(session.uid).catch(() => null);
  const first = profile?.fullName.trim().split(/\s+/)[0];
  return (
    <div className="tr-dash space-y-6">
      <Hero
        image="hero-athlete"
        eyebrow="Athlete profile"
        badge={profile?.status === "verified" ? <VerifiedSeal label="Identity verified" /> : null}
        title={first ? `Welcome back, ${first}` : "Welcome to TrackRecord"}
        avatar={photos?.selfie ?? null}
        subtitle={profile ? <>Class {profile.sportClass} &middot; {profile.events.join(", ")}</> : null}
      >
        <JumpLinks links={[{ href: "#journey", label: "My road" }, { href: "#qualifiers", label: "Qualifiers" }, { href: "#objections", label: "Objections" }]} />
      </Hero>
      <Suspense fallback={<p role="status">Loading your numbers...</p>}>
        <AthleteStats uid={session.uid} />
      </Suspense>
      <Suspense fallback={<p role="status">Loading your road to selection...</p>}>
        <Journeys uid={session.uid} />
      </Suspense>
      <Suspense fallback={<p role="status">Loading your objections...</p>}>
        <Objections />
      </Suspense>
      <Suspense fallback={<p role="status">Loading qualifiers...</p>}>
        <Qualifiers profile={profile} />
      </Suspense>
    </div>
  );
}

async function Qualifiers({ profile }: { profile: Profile | null }) {
  const session = await requireRole("athlete");
  const events = await listEvents();
  return (
    <section aria-labelledby="qualifiers" className="space-y-4">
      <h2 id="qualifiers" className="text-xl font-semibold">Qualifiers</h2>
      <p className="text-sm text-muted-foreground">
        You register yourself. If you meet the rules you are on the list; no coach or official has to approve it.
        Once a list is sealed, nobody can remove you without a signed, public record that you can contest.
      </p>
      {events.length === 0 ? <p className="text-muted-foreground">No upcoming qualifiers yet.</p> : null}
      {events.map((ev) => (
        <Suspense key={ev.id} fallback={<p>Loading {ev.name}...</p>}>
          <AthleteEvent ev={ev} uid={session.uid} profile={profile} />
        </Suspense>
      ))}
    </section>
  );
}

async function AthleteEvent({ ev, uid, profile }: { ev: EventView; uid: string; profile: Profile | null }) {
  await requireRole("athlete");
  const [entry, status] = await Promise.all([
    adminDb().collection(startListPath(ev.id)).doc(uid).get(),
    adminDb().collection(CHECKIN_STATUS).doc(statusId(ev.id, uid)).get(),
  ]);
  const checkedIn = status.exists;
  const races = profile ? ev.events.filter((r) => profile.events.includes(r)) : [];
  let body;
  if (entry.exists) {
    body = (
      <div className="rounded-md bg-muted p-3 text-sm">
        <p className="font-medium">You are on this start list for {(entry.get("events") as string[]).join(", ")}.</p>
        <p>Registered {formatEAT(entry.get("registeredAt"))}. Your signed registration fingerprint: <code className="break-all">{String(entry.get("signedHash")).slice(0, 16)}...</code></p>
        {ev.sealedAt ? <p>Sealed in public ledger record #{ev.sealedSeq}.</p> : <p>It will be sealed at {formatEAT(ev.lockTime)}. Check-in opens then.</p>}
        {checkedIn ? <MyResults ev={ev} uid={uid} races={entry.get("events") as string[]} /> : null}
        {ev.checkInOpen ? (
          <div className="mt-3">
            <MyCheckInCode eventId={ev.id} name={entry.get("fullName")} sportClass={entry.get("sportClass")} />
          </div>
        ) : ev.sealedAt ? (
          <p>Check-in closed {formatEAT(ev.checkInCloses)}.</p>
        ) : null}
      </div>
    );
  } else if (!ev.registrationOpen) {
    body = <p className="text-sm text-muted-foreground">Registration is closed.</p>;
  } else if (!profile || !ev.classes.includes(profile.sportClass)) {
    body = <p className="text-sm text-muted-foreground">Your class isn&apos;t on this qualifier&apos;s programme.</p>;
  } else if (races.length === 0) {
    body = <p className="text-sm text-muted-foreground">None of the races in your profile are on this programme.</p>;
  } else {
    body = <RegisterForm eventId={ev.id} eventName={ev.name} races={races} />;
  }
  return (
    <article className="space-y-3 rounded-lg border p-4" aria-label={ev.name}>
      <EventSummary ev={ev} />
      {body}
    </article>
  );
}

async function Objections() {
  const session = await requireRole("athlete");
  const snap = await adminDb().collection("objections").where("athleteId", "==", session.uid).limit(50).get();
  if (snap.empty) return null;
  const items = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as { eventId: string; reasonCategory: string; reason: string; createdAt: string; response: string | null; ledgerSeq: number }) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-labelledby="objections" className="space-y-4">
      <h2 id="objections" className="text-xl font-semibold">Objections to your entries ({items.length})</h2>
      <p className="text-sm">
        <strong>You are still on the start list.</strong> An objection does not remove you. It is recorded permanently,
        and your answer is recorded next to it.
      </p>
      <ul className="space-y-3">
        {items.map((o) => (
          <li key={o.id} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              <strong>{categoryLabel(o.reasonCategory)}</strong> - {formatEAT(o.createdAt)} - ledger record #{o.ledgerSeq}
            </p>
            <p>{o.reason}</p>
            {o.response ? <p className="text-sm text-muted-foreground">Your answer: {o.response}</p> : <RespondForm objectionId={o.id} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** After check-in: enter your own time for each race, and see whether it locked or was contested. */
async function MyResults({ ev, uid, races }: { ev: EventView; uid: string; races: string[] }) {
  await requireRole("athlete");
  const db = adminDb();
  const items = await Promise.all(
    races.map(async (race) => {
      const [result, mine] = await Promise.all([
        db.collection(RESULTS).doc(resultId(ev.id, race, uid)).get(),
        db.collection(ENTRIES).doc(entryId(ev.id, race, uid, "athlete")).get(),
      ]);
      return { race, result: result.exists ? (result.data() as ResultDoc) : null, mine: mine.exists ? (mine.get("hundredths") as number) : null };
    }),
  );
  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <p className="font-medium">Your results</p>
      {items.map(({ race, result, mine }) => (
        <div key={race} className="space-y-1">
          <p className="font-medium">{race}</p>
          {result ? (
            <ResultStatus r={result} />
          ) : mine !== null ? (
            <p>You signed {formatTime(mine)}. Waiting for your coach to enter theirs.</p>
          ) : ev.resultsOpen ? (
            <ResultForm eventId={ev.id} race={race} athleteId={uid} label={`Your ${race} time`} />
          ) : (
            <p>The window for entering results has closed.</p>
          )}
        </div>
      ))}
    </div>
  );
}

async function Journeys({ uid }: { uid: string }) {
  await requireRole("athlete");
  const journeys = await journeysFor(uid);
  if (journeys.length === 0) return null;
  return (
    <section aria-labelledby="journey" className="space-y-4">
      <h2 id="journey" className="text-xl font-semibold">Your road to selection</h2>
      {journeys.map((j) => (
        <JourneyView key={`${j.selection.id}-${j.sportClass}-${j.race}`} j={j} uid={uid} />
      ))}
    </section>
  );
}

/** Four glanceable numbers at the top of the dashboard. */
async function AthleteStats({ uid }: { uid: string }) {
  await requireRole("athlete");
  const db = adminDb();
  const [events, results, journeys] = await Promise.all([
    listEvents(),
    db.collection(RESULTS).where("athleteId", "==", uid).get(),
    journeysFor(uid),
  ]);
  const entries = await Promise.all(events.map((ev) => db.collection(startListPath(ev.id)).doc(uid).get()));
  const mine = events.filter((_, i) => entries[i].exists);
  const next = mine.filter((ev) => !ev.raceStarted).sort((a, b) => a.raceStart.localeCompare(b.raceStart))[0];
  const times = results.docs
    .map((d) => d.data() as ResultDoc)
    .map((r) => (r.status === "locked" ? r.hundredths : r.status === "decided" ? (r.finalHundredths ?? null) : null))
    .filter((t): t is number => t !== null);
  const j = journeys[0];
  const standing =
    !j ? "-" : j.final.kind === "selected" ? "Selected" : j.final.kind === "reserve" ? `Reserve #${j.final.rank}` : j.final.kind === "removed" ? "Removed" : j.final.rank ? `#${j.final.rank}` : "-";
  return (
    <Stats>
      <Stat tone="feature" label="Qualifiers entered" value={mine.length} hint={mine.length ? "Registered by you, signed" : "Register below"} />
      <Stat tone="peach" label="Personal best" value={times.length ? formatTime(Math.min(...times)) : "-"} hint={times.length ? "Locked on the public record" : "No locked time yet"} />
      <Stat tone="sage" label="Selection" value={standing} hint={j ? `${j.sportClass} ${j.race}` : "No selection yet"} />
      <Stat
        tone="plain"
        label="Next race"
        value={next ? new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }).format(new Date(next.raceStart)) : "-"}
        hint={next ? next.name : "Nothing coming up"}
      />
    </Stats>
  );
}
