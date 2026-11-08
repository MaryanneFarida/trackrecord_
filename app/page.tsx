import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { ROLE_LABELS, homeFor } from "@/lib/auth/roles";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">TrackRecord</h1>
        <p className="text-lg text-muted-foreground">
          Tamper-evident performance records for Kenyan para-athletes. Nothing in TrackRecord can be changed silently.
        </p>
      </header>
      <Suspense fallback={<p>Loading...</p>}>
        <SignedInState />
      </Suspense>
      <p>
        <Link href="/verify/1" className="underline underline-offset-4">Verify a certificate</Link> (no account needed)
      </p>
    </main>
  );
}

async function SignedInState() {
  const session = await getSession();
  if (!session) {
    return (
      <Button asChild className="h-11 px-6 text-base">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="space-y-3">
      <p>
        Signed in as <strong>{session.email}</strong>
        {session.role ? ` (${ROLE_LABELS[session.role]})` : ""}.
      </p>
      <Button asChild className="h-11 px-6 text-base">
        <Link href={homeFor(session.role)}>Open my area</Link>
      </Button>
    </div>
  );
}
