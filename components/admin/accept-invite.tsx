"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOutEverywhere } from "@/lib/auth/client";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function accept() {
    setBusy(true);
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      setBusy(false);
      setMessage("The invite couldn't be accepted. Reload the page to see why.");
      return;
    }
    setMessage("Done. Signing you out so your new role takes effect...");
    await signOutEverywhere();
    router.replace("/login");
  }

  return (
    <div className="space-y-3">
      <Button className="min-h-11 w-full text-base" onClick={accept} disabled={busy}>Accept invite</Button>
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}
