import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/roles";
import { adminDb } from "@/lib/firebase/admin";
import { OnboardingForm } from "@/components/athletes/onboarding-form";

export const metadata = { title: "Register as an athlete" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-10">
      <Suspense fallback={<p role="status">Loading...</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");
  if (session.role) redirect(homeFor(session.role));
  const app = await adminDb().collection("athletes").doc(session.uid).get();
  const status = app.exists ? (app.get("status") as string) : null;

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Register as a para-athlete</h1>
        <p className="text-muted-foreground">
          The federation checks your ID against your selfie before you can register for qualifiers. Your photos are
          encrypted and only the federation admin can view them.
        </p>
      </header>
      {status === "pending" ? (
        <p role="status" className="rounded-lg border p-4">
          Your application was received on {String(app.get("submittedAt")).slice(0, 10)} and is waiting for the federation
          to check it. You&apos;ll be able to open your area once it&apos;s approved. Sign out and in again after approval.
        </p>
      ) : (
        <>
          {status === "rejected" ? (
            <p role="alert" className="rounded-lg border border-destructive p-4">
              Your last application wasn&apos;t approved: <strong>{String(app.get("rejectionReason") ?? "no reason given")}</strong>.
              You can correct it and apply again below.
            </p>
          ) : null}
          <OnboardingForm defaultName={(app.exists && (app.get("fullName") as string)) || ""} />
        </>
      )}
    </>
  );
}
