import Link from "next/link";
import type { Role } from "@/lib/auth/roles";
import { openNoticesFor, plainProblem } from "@/lib/ledger/tamper-cases";

/** Red notice at the top of every dashboard while a record this person is linked to has been tampered with. */
export async function TamperNotices({ uid, role }: { uid: string; role: Role }) {
  let notices: Awaited<ReturnType<typeof openNoticesFor>> = [];
  try {
    notices = await openNoticesFor(uid);
  } catch (err) {
    console.error("[tamper] notices unavailable", err);
  }
  if (notices.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4">
      {notices.map((n) => (
        <div key={n.seq} role="alert" className="mb-3 space-y-2 rounded-[1.25rem] border-2 border-destructive bg-destructive p-5 text-white shadow-lg">
          <p className="text-lg font-semibold">&#9888; Record #{n.seq} has been tampered with</p>
          <p>
            TrackRecord detected that {plainProblem(n.problems[0])}.{" "}
            {role === "tribunal"
              ? "It has been escalated to you for review."
              : "It has been escalated to the tribunal automatically. The original locked result can still be proven."}
          </p>
          <Link href={`/verify/${n.seq}`} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 font-semibold text-destructive">
            View the record
          </Link>
        </div>
      ))}
    </div>
  );
}
