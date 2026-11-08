import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/roles";
import { safeNext } from "@/lib/auth/redirect";
import { firestoreStore } from "@/lib/passkeys/firestore-store";
import { PasskeyActions } from "@/components/passkeys/passkey-actions";

export const metadata = { title: "Your passkeys" };

export default function PasskeysPage({ searchParams }: PageProps<"/account/passkeys">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
      <Suspense fallback={<p role="status">Loading your passkeys...</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/account/passkeys">["searchParams"] }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/passkeys");
  const params = await searchParams;
  const setup = params.setup === "1";
  const next = safeNext(typeof params.next === "string" ? params.next : null) ?? homeFor(session.role);
  const passkeys = await firestoreStore().list(session.uid);

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{setup && passkeys.length === 0 ? "Set up your passkey" : "Your passkeys"}</h1>
        <p className="text-muted-foreground">
          A passkey is a key locked inside your phone. It unlocks with your fingerprint, face or PIN, and it signs
          everything you approve in TrackRecord. It can&apos;t be shared, guessed or phished.
        </p>
      </header>

      {passkeys.length > 0 ? (
        <ul className="divide-y rounded-lg border" aria-label="Registered passkeys">
          {passkeys.map((p) => (
            <li key={p.id} className="space-y-0.5 p-4">
              <p className="font-medium">{p.label}</p>
              <p className="text-sm text-muted-foreground">
                Added {p.createdAt.slice(0, 10)}
                {p.lastUsedAt ? ` - last used ${p.lastUsedAt.slice(0, 10)}` : " - not used yet"}
                {p.backedUp ? " - synced to your account" : " - this device only"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border p-4">You don&apos;t have a passkey yet. You need one before you can open your area.</p>
      )}

      <PasskeyActions hasPasskey={passkeys.length > 0} next={setup ? next : null} />

      {passkeys.length > 0 ? (
        <Link href={next} className="inline-block underline underline-offset-4">
          Continue to my area
        </Link>
      ) : null}
    </>
  );
}
