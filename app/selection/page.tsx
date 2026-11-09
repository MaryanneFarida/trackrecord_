import { Suspense } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { VerifiedSeal } from "@/components/dash/verified";
import { formatEAT } from "@/lib/events/rules";
import { listSelections } from "@/lib/selection/server";

export const metadata = { title: "Final lists" };

/** Public, no sign-in: every team selection, its rules, and its final list once generated. */
export default function SelectionsIndex() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
        <header className="space-y-2">
          <p className="tr-eyebrow">Public</p>
          <h1 className="text-4xl font-semibold">Teams and final lists</h1>
          <p className="text-lg text-muted-foreground">
            Every team is picked by rules published before the season. Anyone can see who was selected, their times, the
            reserves and every removal, with no account.
          </p>
        </header>
        <Suspense fallback={<p role="status">Loading...</p>}>
          <List />
        </Suspense>
      </main>
    </>
  );
}

async function List() {
  const selections = await listSelections();
  if (selections.length === 0) return <p className="text-muted-foreground">No team selections have been published yet.</p>;
  return (
    <ul className="space-y-3">
      {selections.map((s) => (
        <li key={s.id}>
          <Link href={`/selection/${s.id}`} className="block space-y-2 rounded-[1.25rem] border bg-card p-5 transition-colors hover:border-primary">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-semibold">{s.name}</h2>
              {s.finalList ? <VerifiedSeal label="Final list" /> : <span className="rounded-full bg-peach-soft px-3 py-1 text-xs font-semibold">Live standings</span>}
            </div>
            <p className="text-muted-foreground">
              {s.quotas.map((q) => `${q.sportClass} ${q.race}: ${q.places} place${q.places === 1 ? "" : "s"}`).join(" \u00b7 ")}
            </p>
            <p className="text-sm text-muted-foreground">
              {s.generatedAt ? `Final list generated ${formatEAT(s.generatedAt)}` : `Rules published ${formatEAT(s.createdAt)}; final list not generated yet`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
