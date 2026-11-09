import { Suspense, type ReactNode } from "react";
import { adminDb } from "@/lib/firebase/admin";
import { docId, LEDGER, HEAD } from "@/lib/ledger/store";
import { verifyRecord, type LedgerRecord } from "@/lib/ledger/chain";
import { publicKeys } from "@/lib/ledger/server";
import { formatTime } from "@/lib/schemas";
import { categoryLabel, formatEAT } from "@/lib/events/rules";
import { ShareRecord } from "@/components/results/share-record";
import Link from "next/link";
import { groundLabel } from "@/lib/selection/rules";
import { resultId } from "@/lib/results/rules";

export const metadata = { title: "Verify a record" };

/**
 * Public, no sign-in: anyone (a selector, a journalist, the tribunal) can check
 * that a record is genuine. Written for people, with the technical proof folded away.
 */
export default function VerifyPage({ params }: PageProps<"/verify/[recordId]">) {
  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Suspense fallback={<p role="status">Checking the record...</p>}>
        <RecordView params={params} />
      </Suspense>
    </section>
  );
}

interface Ctx {
  athleteName: string | null;
  sportClass: string | null;
  eventName: string | null;
  venue: string | null;
  raceStart: string | null;
}

async function context(p: Record<string, unknown>): Promise<Ctx> {
  const db = adminDb();
  const [a, e] = await Promise.all([
    typeof p.athleteId === "string" ? db.collection("athletes").doc(p.athleteId).get() : null,
    typeof p.eventId === "string" ? db.collection("events").doc(p.eventId).get() : null,
  ]);
  return {
    athleteName: a?.get("fullName") ?? null,
    sportClass: a?.get("sportClass") ?? null,
    eventName: e?.get("name") ?? null,
    venue: e?.get("venue") ?? null,
    raceStart: e?.exists ? e.get("raceStart") : null,
  };
}

async function RecordView({ params }: { params: PageProps<"/verify/[recordId]">["params"] }) {
  const { recordId } = await params;
  const seq = Number(recordId);
  if (!Number.isInteger(seq) || seq < 1) return <p role="alert">That isn&apos;t a record number.</p>;
  const db = adminDb();
  const [doc, prev, next, head] = await Promise.all([
    db.collection(LEDGER).doc(docId(seq)).get(),
    seq > 1 ? db.collection(LEDGER).doc(docId(seq - 1)).get() : null,
    db.collection(LEDGER).doc(docId(seq + 1)).get(),
    db.doc(HEAD).get(),
  ]);
  if (!doc.exists) return <p role="alert">Record #{seq} does not exist.</p>;
  const r = doc.data() as LedgerRecord;
  const p = r.payload as Record<string, unknown>;
  const ctx = await context(p);

  const problems = verifyRecord(r, publicKeys());
  const checks = [
    { label: "Its contents haven't been changed since it was recorded", ok: problems.every((x) => x.problem !== "hash_mismatch") },
    { label: "It was signed by TrackRecord's published key", ok: problems.length === 0 },
    { label: "It is linked to the record before it", ok: seq === 1 ? r.prevHash === "0".repeat(64) : Boolean(prev?.exists) && prev!.get("hash") === r.prevHash },
    { label: "Nothing after it has been removed or rewritten", ok: next.exists ? next.get("prevHash") === r.hash : (head.get("seq") as number) === seq && head.get("hash") === r.hash },
  ];
  const allOk = checks.every((c) => c.ok);

  return (
    <>
      <Body r={r} ctx={ctx} />

      <div className={`space-y-2 rounded-lg border-2 p-4 ${allOk ? "" : "border-destructive"}`}>
        <h2 className="text-lg font-semibold">{allOk ? "This record is genuine and unchanged" : "Warning: this record failed a check"}</h2>
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.label}>
              <span aria-hidden="true">{c.ok ? "\u2713" : "\u2717"}</span> {c.label}
              <span className="sr-only">{c.ok ? ": passed" : ": FAILED"}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Public record #{r.seq}, recorded {formatEAT(r.createdAt)}.</p>
      </div>

      <details className="rounded-lg border p-4 text-sm">
        <summary className="min-h-11 cursor-pointer content-center font-medium">Technical details (for experts)</summary>
        <div className="mt-3 space-y-2 break-all">
          <p>Fingerprint (SHA-256): <code>{r.hash}</code></p>
          <p>Previous record&apos;s fingerprint: <code>{r.prevHash}</code></p>
          <p>Signing key: <code>{r.keyId}</code></p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{JSON.stringify(r.payload, null, 2)}</pre>
        </div>
      </details>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Where({ ctx }: { ctx: Ctx }) {
  return (
    <>
      {ctx.eventName ? <Row label="Qualifier">{ctx.eventName}</Row> : null}
      {ctx.venue ? <Row label="Venue">{ctx.venue}</Row> : null}
      {ctx.raceStart ? <Row label="Date">{formatEAT(ctx.raceStart)}</Row> : null}
    </>
  );
}

async function Body({ r, ctx }: { r: LedgerRecord; ctx: Ctx }) {
  const p = r.payload as Record<string, unknown>;
  const athlete = ctx.athleteName ?? "The athlete";

  if (r.type === "RESULT_LOCKED") {
    return (
      <>
        <div className="space-y-3 rounded-lg border-4 border-double p-6 text-center">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">TrackRecord verified result</p>
          <h1 className="text-3xl font-semibold">{athlete}</h1>
          <p className="text-lg">
            {ctx.sportClass ? `Class ${ctx.sportClass} - ` : ""}
            {String(p.race)}
          </p>
          <p className="font-mono text-5xl font-semibold">{formatTime(p.hundredths as number)}</p>
          <p>
            {ctx.eventName ?? "Qualifier"}
            {ctx.venue ? `, ${ctx.venue}` : ""}
            {ctx.raceStart ? <><br />{formatEAT(ctx.raceStart)}</> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            The coach and the athlete entered this time separately, each signed with their own passkey. The two times
            matched, so it was locked into TrackRecord&apos;s public record and can never be changed silently.
          </p>
        </div>
        <ShareRecord title={`Verified result: ${athlete}, ${String(p.race)}`} summary={`${athlete} ran ${String(p.race)} in ${formatTime(p.hundredths as number)} at ${ctx.eventName ?? "a TrackRecord qualifier"}.`} />
      </>
    );
  }

  if (r.type === "RESULT_CONTESTED") {
    const decision = await adminDb().collection("results").doc(resultId(String(p.eventId), String(p.race), String(p.athleteId))).get();
    const decidedSeq = decision.get("status") === "decided" ? (decision.get("decisionSeq") as number) : null;
    const coach = formatTime(p.coachHundredths as number);
    const mine = formatTime(p.athleteHundredths as number);
    const summary = `Contested result: ${athlete}, ${String(p.race)} at ${ctx.eventName ?? "a TrackRecord qualifier"}. The coach entered ${coach}; the athlete entered ${mine}.`;
    return (
      <>
        <div className="space-y-4">
          <p className="inline-block rounded-full bg-destructive/10 px-3 py-1 text-sm font-semibold text-destructive">Contested result</p>
          <h1 className="text-2xl font-semibold">
            {athlete}, {String(p.race)}: the two times don&apos;t match
          </h1>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Coach entered</p>
              <p className="font-mono text-3xl font-semibold">{coach}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Athlete entered</p>
              <p className="font-mono text-3xl font-semibold">{mine}</p>
            </div>
          </div>
          <dl>
            <Row label="Athlete">{athlete}{ctx.sportClass ? ` (class ${ctx.sportClass})` : ""}</Row>
            <Row label="Race">{String(p.race)}</Row>
            <Where ctx={ctx} />
            <Row label="Status">
              {decidedSeq ? (
                <Link href={`/verify/${decidedSeq}`} className="underline underline-offset-2">
                  Decided by the tribunal: {formatTime(decision.get("finalHundredths"))} (record #{decidedSeq})
                </Link>
              ) : (
                "Waiting for the tribunal"
              )}
            </Row>
          </dl>
          <div className="space-y-2 rounded-lg bg-muted p-4">
            <h2 className="font-semibold">What happens now</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Both times are locked on the public record. Neither the coach nor the athlete can change them.</li>
              <li>Share this page with the Sports Disputes Tribunal or the federation. They can check it without an account.</li>
              <li>The tribunal decides the final time. Its decision will be added on top of this record; this disagreement stays visible.</li>
            </ol>
          </div>
        </div>
        <ShareRecord primary title={`Contested result: ${athlete}, ${String(p.race)}`} summary={summary} />
      </>
    );
  }

  const simple: Record<string, { title: string; lines: ReactNode }> = {
    EVENT_CREATED: {
      title: "A qualifier was created",
      lines: (
        <dl>
          <Row label="Qualifier">{String(p.name)}</Row>
          <Row label="Venue">{String(p.venue)}</Row>
          <Row label="First race">{formatEAT(String(p.raceStart))}</Row>
          <Row label="List locks">{formatEAT(String(p.lockTime))}</Row>
          <Row label="Races">{(p.events as string[]).join(", ")}</Row>
          <Row label="Classes">{(p.classes as string[]).join(", ")}</Row>
        </dl>
      ),
    },
    STARTLIST_SEALED: {
      title: "A start list was sealed",
      lines: (
        <dl>
          <Where ctx={ctx} />
          <Row label="Athletes">{String(p.count)}</Row>
          <Row label="Meaning">From this moment, adding or removing anyone shows up as a mismatch with this seal.</Row>
        </dl>
      ),
    },
    OBJECTION: {
      title: "A coach objected to an entry",
      lines: (
        <dl>
          <Where ctx={ctx} />
          <Row label="Reason category">{categoryLabel(String(p.category))}</Row>
          <Row label="Meaning">An objection removes nobody. The athlete was told and can answer it.</Row>
        </dl>
      ),
    },
    SELECTION_RULES: {
      title: "Selection rules were published",
      lines: (
        <dl>
          <Row label="Selection">{String(p.name)}</Row>
          <Row label="Qualifiers">{(p.qualifierIds as string[]).length} counting</Row>
          <Row label="Places">{(p.quotas as { sportClass: string; race: string; places: number }[]).map((q) => `${q.sportClass} ${q.race}: ${q.places}`).join(", ")}</Row>
          <Row label="Meaning">Published before results counted. These rules can never be edited.</Row>
          <Row label="List"><Link href={`/selection/${String(p.selectionId)}`} className="underline underline-offset-2">See the standings or final list</Link></Row>
        </dl>
      ),
    },
    FINAL_LIST: {
      title: `Final list generated (version ${String(p.version)})`,
      lines: (
        <dl>
          <Row label="Made by">{(p.cause as { by: string; removalId?: string }).removalId ? "Recomputed automatically after an approved removal or withdrawal" : "Generated from the published rules"}</Row>
          <Row label="Selected">{(p.quotas as { selected: unknown[] }[]).reduce((n, q) => n + q.selected.length, 0)} athletes</Row>
          <Row label="List"><Link href={`/selection/${String(p.selectionId)}`} className="underline underline-offset-2">See the names and times</Link></Row>
        </dl>
      ),
    },
    REMOVAL: {
      title: p.ground === "voluntary" ? "An athlete withdrew (signed by the athlete)" : "A removal was proposed",
      lines: (
        <dl>
          {ctx.athleteName ? <Row label="Athlete">{ctx.athleteName}</Row> : null}
          <Row label="Race">{`${String(p.sportClass)} ${String(p.race)}`}</Row>
          <Row label="Reason">{groundLabel(String(p.ground))}</Row>
          {p.ground !== "voluntary" ? <Row label="Evidence">{String(p.evidenceRef)}</Row> : null}
          {p.ground !== "voluntary" ? <Row label="Meaning">Nothing changes until an independent tribunal member reviews it. The athlete can respond first.</Row> : null}
          <Row label="List"><Link href={`/selection/${String(p.selectionId)}`} className="underline underline-offset-2">See the list and every removal</Link></Row>
        </dl>
      ),
    },
    REMOVAL_REVIEW: {
      title: p.decision === "approved" ? "A tribunal member APPROVED a removal" : "A tribunal member REJECTED a removal",
      lines: <p>{p.decision === "approved" ? "The final list was recomputed and the next athlete moved up." : "The athlete stays on the list."} The reviewer&apos;s reason is shown on the list page.</p>,
    },
    TRIBUNAL_DECISION: {
      title: "The tribunal decided a contested result",
      lines: (
        <dl>
          {ctx.athleteName ? <Row label="Athlete">{ctx.athleteName}</Row> : null}
          <Row label="Race">{String(p.race)}</Row>
          <Where ctx={ctx} />
          <Row label="Final time"><span className="font-mono">{formatTime(p.hundredths as number)}</span></Row>
          <Row label="Dispute"><Link href={`/verify/${String(p.contestedSeq)}`} className="underline underline-offset-2">The original contested record #{String(p.contestedSeq)} stays visible</Link></Row>
        </dl>
      ),
    },
    REMOVAL_RESPONSE: {
      title: "An athlete responded to a proposed removal",
      lines: <p>The response is shown with the removal on the list page, and the tribunal reads it before deciding.</p>,
    },
    OBJECTION_RESPONSE: {
      title: "An athlete answered an objection",
      lines: <p>The answer is kept with the objection for the tribunal.</p>,
    },
    CHECKIN_SUMMARY: {
      title: "Check-in closed",
      lines: (
        <dl>
          <Where ctx={ctx} />
          <Row label="Checked in">{(p.checkedIn as string[]).length}</Row>
          <Row label="Refused at face check">{(p.refusedFace as string[]).length}</Row>
          <Row label="Didn't show">{(p.noShow as string[]).length}</Row>
        </dl>
      ),
    },
  };
  const s = simple[r.type] ?? { title: `Record type: ${r.type}`, lines: null };
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{s.title}</h1>
      {s.lines}
      <ShareRecord title={s.title} summary={`TrackRecord public record #${r.seq}: ${s.title}.`} />
    </div>
  );
}
