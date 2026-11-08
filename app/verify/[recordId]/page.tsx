import { Suspense } from "react";
import { adminDb } from "@/lib/firebase/admin";
import { docId, LEDGER, HEAD } from "@/lib/ledger/store";
import { verifyRecord, type LedgerRecord } from "@/lib/ledger/chain";
import { publicKeys } from "@/lib/ledger/server";
import { formatTime } from "@/lib/schemas";
import { formatEAT } from "@/lib/events/rules";
import { PrintButton } from "@/components/results/print-button";

export const metadata = { title: "Verify a record" };

/**
 * Public, no sign-in: anyone (a selector, a journalist, the tribunal) can check
 * that a record is genuine. For a locked result it doubles as the certificate.
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

  const checks = [
    { label: "The record's contents match its fingerprint (hash)", ok: verifyRecord(r, publicKeys()).every((p) => p.problem !== "hash_mismatch") },
    { label: "Signed by TrackRecord's published key", ok: verifyRecord(r, publicKeys()).length === 0 },
    { label: "Linked to the record before it", ok: seq === 1 ? r.prevHash === "0".repeat(64) : Boolean(prev?.exists) && prev!.get("hash") === r.prevHash },
    { label: "The record after it still points to it", ok: next.exists ? next.get("prevHash") === r.hash : (head.get("seq") as number) === seq && head.get("hash") === r.hash },
  ];
  const allOk = checks.every((c) => c.ok);

  return (
    <>
      {r.type === "RESULT_LOCKED" ? <Certificate r={r} /> : <Generic r={r} />}
      <div className="space-y-2 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{allOk ? "This record is genuine and unchanged" : "WARNING: this record failed a check"}</h2>
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.label}>
              <span aria-hidden="true">{c.ok ? "[OK]" : "[FAILED]"}</span> {c.label}
              <span className="sr-only">{c.ok ? ": passed" : ": failed"}</span>
            </li>
          ))}
        </ul>
        <p className="break-all text-xs text-muted-foreground">
          Record #{r.seq}, created {formatEAT(r.createdAt)}. Fingerprint {r.hash}
        </p>
      </div>
      <PrintButton />
    </>
  );
}

async function Certificate({ r }: { r: LedgerRecord }) {
  const p = r.payload as { eventId: string; race: string; athleteId: string; hundredths: number };
  const db = adminDb();
  const [athlete, ev] = await Promise.all([db.collection("athletes").doc(p.athleteId).get(), db.collection("events").doc(p.eventId).get()]);
  return (
    <div className="space-y-3 rounded-lg border-4 border-double p-6 text-center">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">TrackRecord verified result</p>
      <h1 className="text-3xl font-semibold">{athlete.get("fullName") ?? "Athlete"}</h1>
      <p className="text-lg">
        Class {athlete.get("sportClass") ?? "-"} - {p.race}
      </p>
      <p className="font-mono text-5xl font-semibold">{formatTime(p.hundredths)}</p>
      <p>
        {ev.get("name") ?? "Qualifier"}, {ev.get("venue") ?? ""}
        <br />
        {ev.exists ? formatEAT(ev.get("raceStart")) : ""}
      </p>
      <p className="text-sm text-muted-foreground">
        Entered separately by the coach and the athlete, each signed with their own passkey. The two times matched, so the
        result was locked into TrackRecord&apos;s public ledger and can never be changed silently.
      </p>
    </div>
  );
}

const TITLES: Record<string, string> = {
  EVENT_CREATED: "Qualifier created",
  STARTLIST_SEALED: "Start list sealed",
  OBJECTION: "Objection raised",
  OBJECTION_RESPONSE: "Objection answered",
  CHECKIN_SUMMARY: "Check-in closed",
  RESULT_CONTESTED: "Result contested",
};

function Generic({ r }: { r: LedgerRecord }) {
  const p = r.payload as Record<string, unknown>;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{TITLES[r.type] ?? r.type}</h1>
      {r.type === "RESULT_CONTESTED" ? (
        <p>
          {String(p.race)}: the coach entered <strong className="font-mono">{formatTime(p.coachHundredths as number)}</strong> and the athlete entered{" "}
          <strong className="font-mono">{formatTime(p.athleteHundredths as number)}</strong>. Both are permanently on the record; the tribunal decides.
        </p>
      ) : null}
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(p, null, 2)}</pre>
    </div>
  );
}
