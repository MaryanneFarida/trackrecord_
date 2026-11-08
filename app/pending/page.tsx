import Link from "next/link";

export const metadata = { title: "Waiting for access" };

export default function Pending() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12">
      <h1 className="text-2xl font-semibold">You&apos;re signed in</h1>
      <p>Your account doesn&apos;t have a role yet. The federation admin gives each person their role.</p>
      <p>Once they have, sign out and sign in again to open your area.</p>
      <Link href="/login" className="underline underline-offset-4">Back to sign in</Link>
    </main>
  );
}
