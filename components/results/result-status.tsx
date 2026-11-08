import Link from "next/link";
import { formatTime } from "@/lib/schemas";
import type { ResultDoc } from "@/lib/results/server";

/** How a decided result is shown everywhere: locked (with its certificate) or contested (with both times). */
export function ResultStatus({ r }: { r: ResultDoc }) {
  if (r.status === "locked") {
    return (
      <p className="text-sm">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Locked</span> <strong className="font-mono">{formatTime(r.hundredths!)}</strong>{" "}
        <Link href={`/verify/${r.ledgerSeq}`} className="underline underline-offset-4">Certificate / verify (ledger #{r.ledgerSeq})</Link>
      </p>
    );
  }
  return (
    <p className="text-sm">
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Contested</span> coach {formatTime(r.coachHundredths)} vs athlete{" "}
      {formatTime(r.athleteHundredths)}.{" "}
      <Link href={`/verify/${r.ledgerSeq}`} className="underline underline-offset-4">Ledger #{r.ledgerSeq}</Link>
    </p>
  );
}
