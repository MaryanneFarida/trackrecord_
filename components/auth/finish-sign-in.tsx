"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/auth/redirect";
import { finishEmailLink, isEmailLink, rememberedEmail } from "@/lib/auth/client";

export function FinishSignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  async function complete(address: string) {
    try {
      const home = await finishEmailLink(address, window.location.href);
      router.replace(next ?? home);
    } catch {
      setError("This link has expired or was already used. Request a new one.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      await Promise.resolve(); // run after the first render
      if (!isEmailLink(window.location.href)) {
        setError("This isn't a valid sign-in link.");
        return;
      }
      const saved = rememberedEmail();
      if (saved) await complete(saved);
      else setNeedEmail(true); // opened on a different device: confirm the address
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">{error}</p>
        <Link href="/login" className="underline underline-offset-4">Back to sign in</Link>
      </div>
    );
  }

  if (needEmail) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void complete(email.trim());
        }}
      >
        <p>For your security, confirm the email address this link was sent to.</p>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required className="h-11 text-base" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" className="h-11 w-full text-base">Continue</Button>
      </form>
    );
  }

  return <p role="status">Signing you in...</p>;
}
