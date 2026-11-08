"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { defaultLabel, explain, passkeysSupported, registerPasskey, verifyWithPasskey } from "@/lib/passkeys/client";

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function PasskeyActions({ hasPasskey, next }: { hasPasskey: boolean; next: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const say = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  async function add() {
    if (!passkeysSupported()) return say("This browser doesn't support passkeys. Try Chrome on your phone.", true);
    setBusy(true);
    try {
      await registerPasskey(defaultLabel());
      say("Passkey created and saved.");
      if (next) router.replace(next);
      else router.refresh();
    } catch (err) {
      say(explain(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      // A sample "action", to show the signature is tied to exactly this text.
      const action = `TrackRecord signature test at ${new Date().toISOString()}`;
      const hash = await sha256Hex(action);
      const result = await verifyWithPasskey(hash);
      say(result.actionHash === hash ? `Signature verified. It approved exactly: "${action}"` : "Signature verified.");
      router.refresh();
    } catch (err) {
      say(explain(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button className="h-11 px-5 text-base" onClick={add} disabled={busy}>
          {hasPasskey ? "Add a passkey on this device" : "Create my passkey"}
        </Button>
        {hasPasskey ? (
          <Button variant="outline" className="h-11 px-5 text-base" onClick={test} disabled={busy}>
            Test a signature
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className={isError ? "text-destructive" : "text-foreground"}>
        {message}
      </p>
    </div>
  );
}
