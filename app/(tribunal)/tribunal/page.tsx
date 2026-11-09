import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { formatTime } from "@/lib/schemas";
import { categoryLabel, formatEAT } from "@/lib/events/rules";
import { canReview, groundLabel } from "@/lib/selection/rules";
import { REMOVALS, athleteNames, type Removal } from "@/lib/selection/server";
import { RESULTS, type ResultDoc } from "@/lib/results/server";
import { DecideResult, ReviewRemoval } from "@/components/selection/actions";

export const metadata = { title: "Tribunal" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("tribunal"); // every role page checks for itself, not just the layout
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Independent review</h1>
        <p className="text-muted-foreground">
          You are independent of the coaches and the federation. Nobody can be removed from a final list without your
          signature, and contested results wait for your decision. Every decision you sign is public, with your reason.
        </p>
      </div>
      <Suspense fallback={<p role="status">Loading removals...</p>}>
        <Removals />
      </Suspense>
      <Suspense fallback={<p role="status">Loading contested results...</p>}>
        <Contested />
      </Suspense>
      <Suspense fallback={<p role="status">Loading objections...</p>}>
        <Objections />
      </Suspense>
    </div>
  );
}

async function loadRemovals() {
  const snap = await adminDb().collection(REMOVALS).where("status", "==", "proposed").get();
  const now = Date.now();
  return snap.docs.map((d) => {
    const r = { id: d.id, ...(d.data() as Omit<Removal, "id">) };
    return { r, ready: canReview(r, now) === null };
  });
}

async function Removals() {
  await requireRole("tribunal");
  const items = await loadRemovals();
  const names = await athleteNames(items.map((x) => x.r.athleteId));
  return (
    <section aria-labelledby="rm" className="space-y-4">
      <h2 id="rm" className="text-xl font-semibold">Proposed removals ({items.length})</h2>
      {items.length === 0 ? <p className="text-muted-foreground">Nothing waiting.</p> : null}
      {items.map(({ r, ready }) => (
        <article key={r.id} className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">
            {names.get(r.athleteId) ?? "Athlete"} - {r.sportClass} {r.race}
          </h3>
          <p>Reason: {groundLabel(r.ground)} - evidence: <strong>{r.evidenceRef}</strong></p>
          <p>Admin&apos;s explanation: {r.note}</p>
          <p>{r.response ? <>Athlete&apos;s response: <strong>{r.response}</strong></> : `No response yet. The athlete can respond until ${formatEAT(r.respondBy)}.`}</p>
          <p className="text-sm">
            <Link href={`/verify/${r.ledgerSeq}`} className="underline underline-offset-2">Proposal record #{r.ledgerSeq}</Link> -{" "}
            <Link href={`/selection/${r.selectionId}`} className="underline underline-offset-2">the list</Link>
          </p>
          <ReviewRemoval removalId={r.id} ready={ready} />
        </article>
      ))}
    </section>
  );
}

async function Contested() {
  await requireRole("tribunal");
  const snap = await adminDb().collection(RESULTS).where("status", "==", "contested").get();
  const items = snap.docs.map((d) => d.data() as ResultDoc);
  const names = await athleteNames(items.map((r) => r.athleteId));
  return (
    <section aria-labelledby="ct" className="space-y-4">
      <h2 id="ct" className="text-xl font-semibold">Contested results ({items.length})</h2>
      {items.length === 0 ? <p className="text-muted-foreground">Nothing waiting.</p> : null}
      {items.map((r) => (
        <article key={`${r.eventId}-${r.race}-${r.athleteId}`} className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">
            {names.get(r.athleteId) ?? "Athlete"} - {r.race}
          </h3>
          <p>
            Coach entered <strong className="font-mono">{formatTime(r.coachHundredths)}</strong>, athlete entered{" "}
            <strong className="font-mono">{formatTime(r.athleteHundredths)}</strong>.{" "}
            <Link href={`/verify/${r.ledgerSeq}`} className="underline underline-offset-2">Record #{r.ledgerSeq}</Link>
          </p>
          <DecideResult eventId={r.eventId} race={r.race} athleteId={r.athleteId} />
        </article>
      ))}
    </section>
  );
}

async function Objections() {
  await requireRole("tribunal");
  const snap = await adminDb().collection("objections").orderBy("createdAt", "desc").limit(50).get();
  const items = snap.docs.map((d) => d.data() as { athleteId: string; reasonCategory: string; reason: string; response: string | null; createdAt: string; ledgerSeq: number });
  const names = await athleteNames(items.map((o) => o.athleteId));
  return (
    <section aria-labelledby="ob" className="space-y-4">
      <h2 id="ob" className="text-xl font-semibold">Objections on record ({items.length})</h2>
      <p className="text-sm text-muted-foreground">Objections never remove anyone. They are here so you can see patterns, for example one coach objecting to the same athletes again and again.</p>
      <ul className="space-y-3">
        {items.map((o) => (
          <li key={o.ledgerSeq} className="space-y-1 rounded-lg border p-3 text-sm">
            <p className="font-medium">
              {names.get(o.athleteId) ?? "Athlete"}: {categoryLabel(o.reasonCategory)} - {formatEAT(o.createdAt)}
            </p>
            <p>{o.reason}</p>
            <p className="text-muted-foreground">{o.response ? `Athlete's answer: ${o.response}` : "No answer yet."}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
