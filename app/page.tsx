import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/roles";
import { firstName } from "@/lib/auth/display-name";
import { PublicHeader } from "@/components/public-header";
import { Photo } from "@/components/dash/photo";
import { VerifiedSeal } from "@/components/dash/verified";
import { adminDb } from "@/lib/firebase/admin";
import { LEDGER } from "@/lib/ledger/store";
import { formatTime } from "@/lib/schemas";

const STEPS = [
  { n: "01", title: "You register yourself", text: "Meet the published rules and you are on the start list. No coach or official approves it, so nobody can quietly refuse it.", color: "text-primary" },
  { n: "02", title: "The list seals itself", text: "24 hours before the race the start list is fingerprinted into the public record. A dropped athlete or a slipped-in relative shows up at once.", color: "text-accent" },
  { n: "03", title: "Two signatures per time", text: "You and your coach each sign your time. When they match it locks forever, with a certificate anyone can check.", color: "text-olive" },
  { n: "04", title: "A team picked by rules", text: "The final list comes from rules published in advance. Removal needs evidence, your response and an independent tribunal signature.", color: "text-primary" },
];

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 md:grid-cols-2 md:py-16" aria-labelledby="home-title">
          <div className="tr-rise space-y-6">
            <p className="tr-eyebrow">For Kenyan para-athletes</p>
            <h1 id="home-title" className="text-4xl font-semibold leading-[1.08] md:text-6xl">
              Your race. Your record. <span className="italic text-accent">Nobody erases it.</span>
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              TrackRecord keeps every entry, time and selection decision on a tamper-evident public record, so a qualified athlete can never be dropped in silence.
            </p>
            <Suspense fallback={<div className="h-14" />}>
              <Cta />
            </Suspense>
          </div>
          <div className="relative">
            <Photo name="hero-home" art="track" alt="A para-athlete racing on the track" className="aspect-[4/5] md:aspect-[5/6]" />
            <Suspense fallback={null}>
              <LatestResult />
            </Suspense>
          </div>
        </section>

        <div className="tr-ticker mt-8 overflow-hidden whitespace-nowrap py-3 text-sm font-medium tracking-[0.2em]" aria-hidden="true">
          SEALED START LISTS &middot; SIGNED RESULTS &middot; PUBLIC PROOF &middot; FAIR SELECTION &middot; NOTHING CHANGES SILENTLY &middot; SEALED START LISTS &middot; SIGNED RESULTS &middot; PUBLIC PROOF
        </div>

        <section id="how" className="mx-auto w-full max-w-6xl space-y-10 px-4 py-14" aria-labelledby="how-title">
          <div className="grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-end">
            <h2 id="how-title" className="text-3xl font-semibold md:text-4xl">From registration to the final list, on the record</h2>
            <p className="text-lg text-muted-foreground">
              Built first for athletes with physical impairments: large buttons, no fiddly gestures, and sign-in with a fingerprint, face or phone PIN.
            </p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[1.5rem] border bg-border md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="space-y-3 bg-card p-6 transition-colors hover:bg-peach-soft">
                <p className={`tr-num text-4xl font-semibold ${s.color}`}>{s.n}</p>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="grid gap-6 md:grid-cols-2">
            <Photo name="feature-checkin" art="finish" alt="An official checking an athlete in at the venue" className="aspect-[16/10]" />
            <div className="flex flex-col justify-center gap-4 rounded-[1.5rem] bg-primary p-8 text-primary-foreground">
              <span className="self-start"><VerifiedSeal tone="light" label="Public proof" /></span>
              <h2 className="text-3xl font-semibold">Got a TrackRecord certificate?</h2>
              <p className="opacity-85">Selectors, sponsors, journalists and the tribunal can check any record. No account needed.</p>
              <form action="/verify" className="flex gap-2">
                <label htmlFor="rec" className="sr-only">Record number</label>
                <input id="rec" name="n" inputMode="numeric" placeholder="Record number" className="h-12 w-full rounded-full border-0 bg-card px-5 text-base text-foreground md:w-56" />
                <button className="h-12 shrink-0 rounded-full bg-accent px-6 font-semibold text-accent-foreground transition-opacity hover:opacity-90">Check</button>
              </form>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">TrackRecord &middot; Built for fair selection in Kenyan para-athletics</footer>
    </>
  );
}

async function Cta() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="inline-flex h-14 items-center rounded-full bg-primary px-7 text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90">Get started</Link>
        <a href="#how" className="inline-flex h-14 items-center rounded-full border-2 border-primary px-7 text-lg font-semibold text-primary transition-colors hover:bg-secondary">How it works</a>
      </div>
    );
  }
  const name = await firstName(session.uid, session.role);
  return (
    <Link href={homeFor(session.role)} className="inline-flex h-14 items-center rounded-full bg-primary px-7 text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90">
      {name ? `Open your dashboard, ${name}` : "Open your dashboard"}
    </Link>
  );
}

/**
 * The newest locked result from the public ledger (public data by design), so the
 * landing page shows the real product. Until there is one, a clearly labelled example.
 */
async function LatestResult() {
  let shown: { race: string; sportClass: string | null; name: string | null; time: string; seq: number } | null = null;
  try {
    const db = adminDb();
    const recent = await db.collection(LEDGER).orderBy("seq", "desc").limit(50).get();
    const rec = recent.docs.map((d) => d.data()).find((r) => r.type === "RESULT_LOCKED");
    if (rec) {
      const a = await db.collection("athletes").doc(rec.payload.athleteId).get();
      shown = {
        race: rec.payload.race,
        sportClass: a.get("sportClass") ?? null,
        name: ((a.get("fullName") as string | undefined) ?? "").split(/\s+/)[0] || null,
        time: formatTime(rec.payload.hundredths),
        seq: rec.seq,
      };
    }
  } catch {
    shown = null;
  }
  const card = "tr-rise absolute -bottom-6 left-4 right-4 rounded-2xl border bg-card p-4 shadow-lg transition-transform hover:-translate-y-0.5 md:-left-10 md:right-auto md:w-72";
  if (!shown) {
    return (
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Example certificate</p>
          <VerifiedSeal />
        </div>
        <p className="tr-num mt-2 text-4xl font-semibold">52.31</p>
        <p className="text-sm text-muted-foreground">T54 400m. Signed by athlete and coach, locked on the public record.</p>
      </div>
    );
  }
  return (
    <Link href={`/verify/${shown.seq}`} className={`block ${card}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Latest locked result</p>
        <VerifiedSeal />
      </div>
      <p className="tr-num mt-2 text-4xl font-semibold">{shown.time}</p>
      <p className="text-sm text-muted-foreground">
        {shown.name ? `${shown.name}, ` : ""}
        {shown.sportClass ? `${shown.sportClass} ` : ""}
        {shown.race}. Public record #{shown.seq}.
      </p>
    </Link>
  );
}
