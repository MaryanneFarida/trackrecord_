"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "idle" }
  | { kind: "showing"; dataUrl: string; code: string; expiresAt: string }
  | { kind: "checked_in"; at: string }
  | { kind: "error"; message: string };

const MESSAGES: Record<string, string> = {
  checkin_closed: "Check-in isn't open for this qualifier yet (it opens when the start list is sealed) or has closed.",
  not_on_list: "You're not on this start list.",
  signed_out: "You've been signed out. Sign in again.",
};

/**
 * The athlete's check-in screen: a QR code that changes every 30 seconds.
 * Show it to the official; a screenshot stops working within a minute.
 */
export function MyCheckInCode({ eventId, name, sportClass }: { eventId: string; name: string; sportClass: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const expires = useRef(0);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    async function refresh() {
      try {
        const res = await fetch("/api/checkin/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) });
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) return setState({ kind: "error", message: MESSAGES[data.error] ?? `Couldn't get your code (code: ${data.error ?? res.status}).` });
        if (data.status === "checked_in") return setState({ kind: "checked_in", at: data.at });
        const dataUrl = await QRCode.toDataURL(data.qr, { errorCorrectionLevel: "M", margin: 2, width: 320 });
        if (stopped) return;
        expires.current = Date.parse(data.expiresAt);
        setState({ kind: "showing", dataUrl, code: data.code, expiresAt: data.expiresAt });
      } catch {
        if (!stopped) setState({ kind: "error", message: "No connection. Check-in needs the internet for now." });
      }
    }
    refresh();
    const poll = setInterval(refresh, 4000); // also notices the moment the official checks you in
    const tick = setInterval(() => setSecondsLeft(Math.max(0, Math.round((expires.current - Date.now()) / 1000))), 1000);
    // Keep the screen on while the code is showing.
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen")
      .then((w) => (wake.current = w))
      .catch(() => {});
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(tick);
      wake.current?.release().catch(() => {});
      wake.current = null;
    };
  }, [open, eventId]);

  if (!open) {
    return (
      <Button className="h-12 px-5 text-base" onClick={() => setOpen(true)}>
        Show my check-in code
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border-2 p-4 text-center" role="region" aria-label="Your check-in code">
      <p className="text-xl font-semibold">{name}</p>
      <p className="text-base">Class {sportClass}</p>
      {state.kind === "idle" ? <p role="status">Loading your code...</p> : null}
      {state.kind === "showing" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.dataUrl} alt={`Check-in QR code. If scanning fails, the official can type code ${state.code.split("").join(" ")}`} className="mx-auto w-full max-w-xs rounded-md bg-white" />
          <p className="font-mono text-3xl tracking-[0.3em]" aria-hidden="true">{state.code}</p>
          <p className="text-sm text-muted-foreground" aria-live="off">New code in {secondsLeft} s. Show this screen to the official; they will also look at your face.</p>
        </>
      ) : null}
      {state.kind === "checked_in" ? (
        <p role="status" className="rounded-md bg-muted p-4 text-xl font-semibold">
          You are checked in. Good luck!
        </p>
      ) : null}
      {state.kind === "error" ? <p role="alert">{state.message}</p> : null}
      <Button variant="outline" className="h-11" onClick={() => { setOpen(false); setState({ kind: "idle" }); }}>
        Hide code
      </Button>
    </div>
  );
}
