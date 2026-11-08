"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/auth/redirect";
import { sendEmailLink, signInWithGoogle } from "@/lib/auth/client";

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await sendEmailLink(email.trim(), next);
      setStatus("sent");
      setMessage(`Check ${email.trim()} for your sign-in link. It works once.`);
    } catch {
      setStatus("error");
      setMessage("We couldn't send the link. Check the email address and try again.");
    }
  }

  async function onGoogle() {
    setStatus("sending");
    try {
      const home = await signInWithGoogle();
      router.replace(next ?? home);
    } catch {
      setStatus("error");
      setMessage("Google sign-in didn't finish. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onEmail} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="h-11 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="h-11 w-full text-base" disabled={status === "sending"}>
          Email me a sign-in link
        </Button>
      </form>

      <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="h-11 w-full text-base" onClick={onGoogle} disabled={status === "sending"}>
        Continue with Google
      </Button>

      <p role="status" aria-live="polite" className={status === "error" ? "text-destructive" : "text-foreground"}>
        {message}
      </p>
    </div>
  );
}
