import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listEvents, startList } from "@/lib/events/server";
import { formatEAT } from "@/lib/events/rules";
import { CHECKINS, CHECKIN_STATUS } from "@/lib/checkin/summary";
import { Hero } from "@/components/dash/parts";
import { firstName } from "@/lib/auth/display-name";
import { CheckInDesk } from "@/components/checkin/desk";

export const metadata = { title: "Venue official" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const session = await requireRole("official"); // every role page checks for itself, not just the layout
  const name = await firstName(session.uid, "official");
  return (
    <div className="tr-dash space-y-6">
      <Hero
        image="hero-official"
        art="finish"
        eyebrow="Venue official"
        title={name ? `Good to see you, ${name}` : "Check-in desk"}
        subtitle="Scan the athlete's code, compare their face with the verified photo, then sign. Only athletes on the sealed start list can check in."
      />
      <Suspense fallback={<p role="status">Loading qualifiers...</p>}>
        <Desk />
      </Suspense>
    </div>
  );
}

async function Desk() {
  await requireRole("official");
  const open = (await listEvents()).filter((e) => e.checkInOpen);
  const withRoster = await Promise.all(
    open.map(async (ev) => {
      const [rows, done, attempts] = await Promise.all([
        startList(ev.id),
        adminDb().collection(CHECKIN_STATUS).where("eventId", "==", ev.id).get(),
        adminDb().collection(CHECKINS).where("eventId", "==", ev.id).where("outcome", "==", "refused_face").get(),
      ]);
      return { ev, rows, checkedIn: done.size, refusals: attempts.size };
    }),
  );
  return (
    <section aria-labelledby="desk" className="space-y-6">
      <h2 id="desk" className="text-xl font-semibold">Check-in desk</h2>
      <CheckInDesk events={withRoster.map(({ ev, rows }) => ({ id: ev.id, name: ev.name, roster: rows.map((r) => ({ athleteId: r.athleteId, fullName: r.fullName })) }))} />
      {withRoster.map(({ ev, rows, checkedIn, refusals }) => (
        <p key={ev.id} className="text-sm text-muted-foreground">
          {ev.name}: {checkedIn} of {rows.length} checked in, {refusals} face-check refusal{refusals === 1 ? "" : "s"}. Check-in closes {formatEAT(ev.checkInCloses)}.
        </p>
      ))}
    </section>
  );
}
