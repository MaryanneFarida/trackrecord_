import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Brand } from "@/components/brand";
import { Photo } from "@/components/dash/photo";
import { VerifiedSeal } from "@/components/dash/verified";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 md:grid-cols-2">
      <div className="relative m-3 hidden md:block">
        <Photo name="hero-login" art="track" alt="" className="absolute inset-0" />
        <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-card/95 p-5 shadow-lg backdrop-blur">
          <VerifiedSeal label="On the record" />
          <p className="mt-2 font-heading text-2xl font-semibold leading-snug">Every entry, every time, every decision. Nothing changes silently.</p>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
        <Brand />
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold">Welcome back</h1>
          <p className="text-lg text-muted-foreground">No password needed. We email you a one-time link, or you can use your Google account.</p>
        </header>
        <div className="rounded-[1.5rem] border bg-card p-6">
          <Suspense fallback={<p>Loading...</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
