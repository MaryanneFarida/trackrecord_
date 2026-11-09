import { Suspense } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/schemas";
import { formatEAT } from "@/lib/events/rules";
import { computeFinalList, groundLabel, readiness } from "@/lib/selection/rules";
import { approvedRemovals, athleteNames, countedResults, getSelection, qualifierStates, removalsFor } from "@/lib/selection/server";
import { ShareRecord } from "@/components/results/share-record";

export const metadata = { title: "Final list" };

/** Public, no sign-in: the rules, the live standings or the final list, and every removal with its reasons. */
export default function Page({ params }: PageProps<"/selection/[selectionId]">) {
  return (
    <section className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <Suspense fallback={<p role="status">Loading the list...</p>}>
        <ListView params={params} />
      </Suspense>
    </section>
  );
}

async function ListView({ params }: { params: PageProps<"/selection/[selectionId]">["params"] }) {
  const { selectionId } = await params;
  const sel = await getSelection(selectionId);
  if (!sel) return <p role="alert">This selection doesn&apos;t exist.</p>;
  const [counted, removed, removals, states] = await Promise.all([countedResults(sel.qualifierIds), approvedRemovals(sel.id), removalsFor(sel.id), qualifierStates(sel.qualifierIds)]);
  const lists = sel.finalList ?? computeFinalList(sel.quotas, counted, removed);
  const names = await athleteNames([...lists.flatMap((q) => [...q.ranking.map((r) => r.athleteId), ...q.removed]), ...removals.map((r) => r.athleteId)]);
  const generated = Boolean(sel.finalList);
  const ready = readiness(states);

  return (
    <>
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{generated ? `Final list, version ${sel.finalVersion}` : "Live standings"}</p>
        <h1 className="text-3xl font-semibold">{sel.name}</h1>
        <p className="text-muted-foreground">
          Rules published {formatEAT(sel.createdAt)} as <Link href={`/verify/${sel.ledgerSeq}`} className="underline underline-offset-2">public record #{sel.ledgerSeq}</Link>, before any result counted. Places go to the fastest best locked time across {sel.qualifierIds.length} qualifier{sel.qualifierIds.length === 1 ? "" : "s"}. Nobody can add a name by hand.
        </p>
        {generated ? (
          <p>
            Generated {sel.generatedAt ? formatEAT(sel.generatedAt) : ""}: <Link href={`/verify/${sel.finalListSeq}`} className="underline underline-offset-2">public record #{sel.finalListSeq}</Link>
          </p>
        ) : (
          <p className="text-sm">{ready.ready ? "Every result is in. The admin can now generate the final list." : `Not final yet: ${ready.blockers.join("; ")}.`}</p>
        )}
      </header>

      {lists.map((q) => (
        <section key={`${q.sportClass}-${q.race}`} className="space-y-3" aria-labelledby={`q-${q.sportClass}-${q.race}`}>
          <h2 id={`q-${q.sportClass}-${q.race}`} className="text-xl font-semibold">
            {q.sportClass} {q.race} <span className="text-base font-normal text-muted-foreground">- {q.places} place{q.places === 1 ? "" : "s"}</span>
          </h2>
          {q.ranking.length === 0 ? <p className="text-muted-foreground">No locked results yet.</p> : null}
          <ol className="space-y-2">
            {q.ranking.map((r) => (
              <li key={r.athleteId} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${r.status === "selected" ? "border-primary/60 bg-primary/5" : ""}`}>
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border font-semibold">{r.rank}</span>
                  <span>
                    <span className="font-medium">{names.get(r.athleteId) ?? "Athlete"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.status === "selected" ? (generated ? "Selected" : "In a selection place") : "Reserve"} - best of {r.count} result{r.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <Link href={`/verify/${r.bestSeq}`} className="font-mono text-lg font-semibold underline-offset-2 hover:underline">{formatTime(r.best)}</Link>
              </li>
            ))}
          </ol>
          {q.removed.length > 0 ? <p className="text-sm text-muted-foreground">Removed from this race: {q.removed.map((id) => names.get(id) ?? "Athlete").join(", ")} (see below).</p> : null}
        </section>
      ))}

      <section className="space-y-3" aria-labelledby="removals">
        <h2 id="removals" className="text-xl font-semibold">Removals ({removals.length})</h2>
        <p className="text-sm text-muted-foreground">
          Removal is only possible for a reason on a fixed list, with evidence, after the athlete was told and could respond, and only with an independent tribunal member&apos;s signature. Rejected proposals stay visible too.
        </p>
        {removals.length === 0 ? <p>Nobody has been removed.</p> : null}
        <ul className="space-y-3">
          {removals.map((r) => (
            <li key={r.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {names.get(r.athleteId) ?? "Athlete"} - {r.sportClass} {r.race}:{" "}
                {r.ground === "voluntary" ? "withdrew" : r.status === "proposed" ? "removal proposed, waiting for review" : r.status === "approved" ? "removal approved" : "removal REJECTED, stays on the list"}
              </p>
              <p>Reason: {groundLabel(r.ground)}{r.ground !== "voluntary" ? ` (evidence: ${r.evidenceRef})` : ""}</p>
              {r.ground !== "voluntary" ? <p>Explanation: {r.note}</p> : null}
              {r.response ? <p>Athlete&apos;s response: {r.response}</p> : null}
              {r.reviewReason ? <p>Tribunal&apos;s reason: {r.reviewReason}</p> : null}
              <p>
                <Link href={`/verify/${r.ledgerSeq}`} className="underline underline-offset-2">Record #{r.ledgerSeq}</Link>
                {r.reviewSeq ? <> - <Link href={`/verify/${r.reviewSeq}`} className="underline underline-offset-2">review #{r.reviewSeq}</Link></> : null}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <ShareRecord title={`${sel.name}: ${generated ? "final list" : "standings"}`} summary={`${sel.name} - ${generated ? "final list" : "live standings"} on TrackRecord.`} />
    </>
  );
}
