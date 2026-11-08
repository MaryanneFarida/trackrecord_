import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in to TrackRecord</h1>
        <p className="text-muted-foreground">
          No password needed. We email you a one-time link, or you can use your Google account.
        </p>
      </header>
      <Suspense fallback={<p>Loading...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
