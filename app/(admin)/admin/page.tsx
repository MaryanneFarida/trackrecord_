import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { athletePhotos, listPendingAthletes } from "@/lib/athletes/admin";
import { SPORT_CLASSES } from "@/lib/athletes/schema";
import { ROLE_LABELS, isRole } from "@/lib/auth/roles";
import { ReviewActions } from "@/components/admin/review-actions";
import { InviteForm } from "@/components/admin/invite-form";
import { LedgerHealth } from "@/components/admin/ledger-health";

export const metadata = { title: "Federation admin" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin"); // every role page checks for itself, not just the layout
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Federation admin area</h1>
      <Suspense fallback={<p role="status">Loading applications...</p>}>
        <PendingAthletes />
      </Suspense>
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
          {a.email} - licence {a.licenceNo} - {cls} - {a.events.join(", ")}
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
            {v.email ? ` for ${v.email}` : " (any email)"}
            {v.note ? ` - ${v.note}` : ""} - {status}
          </li>
        );
      })}
    </ul>
  );
}
