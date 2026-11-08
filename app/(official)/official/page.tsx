import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listEvents, startList } from "@/lib/events/server";
import { formatEAT } from "@/lib/events/rules";
import { CHECKINS, CHECKIN_STATUS } from "@/lib/checkin/summary";
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
  await requireRole("official"); // every role page checks for itself, not just the layout
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Check-in desk</h1>
        <p className="text-muted-foreground">
          Scan the code on the athlete&apos;s phone, then compare their face with the verified photo. Your decision is signed
          with your passkey and recorded. Only athletes on the sealed start list can be checked in.
        </p>
      </div>
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
    <section className="space-y-6">
      <CheckInDesk events={withRoster.map(({ ev, rows }) => ({ id: ev.id, name: ev.name, roster: rows.map((r) => ({ athleteId: r.athleteId, fullName: r.fullName })) }))} />
      {withRoster.map(({ ev, rows, checkedIn, refusals }) => (
        <p key={ev.id} className="text-sm text-muted-foreground">
          {ev.name}: {checkedIn} of {rows.length} checked in, {refusals} face-check refusal{refusals === 1 ? "" : "s"}. Check-in closes {formatEAT(ev.checkInCloses)}.
        </p>
      ))}
    </section>
  );
}
