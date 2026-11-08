import { Suspense } from "react";
import { FinishSignIn } from "@/components/auth/finish-sign-in";

export const metadata = { title: "Finishing sign-in" };

export default function FinishPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Finishing sign-in</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <FinishSignIn />
      </Suspense>
    </main>
  );
}
