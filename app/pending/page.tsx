import Link from "next/link";

export const metadata = { title: "Waiting for access" };

export default function Pending() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">You&apos;re signed in</h1>
      <p>Your account doesn&apos;t have a role yet.</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Para-athletes:</strong>{" "}
          <Link href="/onboarding" className="underline underline-offset-4">register here</Link>. The federation checks your
          ID, then opens your area.
        </li>
        <li>
          <strong>Coaches, officials, doctors and tribunal members:</strong> open the invite link the federation sent you.
        </li>
      </ul>
      <p>Once your role is set, sign out and sign in again.</p>
    </main>
  );
}
