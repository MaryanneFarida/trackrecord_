"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Share a record's public link: the phone's share sheet (WhatsApp, email...),
 * copy the link, or open an email ready to send to the tribunal or federation.
 */
export function ShareRecord({ title, summary, primary = false }: { title: string; summary: string; primary?: boolean }) {
  const [message, setMessage] = useState("");

  const url = () => window.location.href;
  const body = () =>
    `${summary}\n\nThis is a TrackRecord public record. Open the link to check that it is genuine and unchanged (no account needed):\n${url()}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: summary, url: url() });
        return;
      }
      await navigator.clipboard.writeText(url());
      setMessage("Link copied. Paste it into WhatsApp, email or a letter to the tribunal.");
    } catch {
      /* the person closed the share sheet */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setMessage("Link copied.");
    } catch {
      setMessage("Couldn't copy. Select the address bar and copy the link from there.");
    }
  }

  function email() {
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body())}`;
  }

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap gap-2">
        <Button className="h-11 px-5 text-base" variant={primary ? "default" : "outline"} onClick={share}>
          {primary ? "Share with the tribunal" : "Share"}
        </Button>
        <Button className="h-11" variant="outline" onClick={email}>Email this record</Button>
        <Button className="h-11" variant="outline" onClick={copy}>Copy link</Button>
        <Button className="h-11" variant="outline" onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </div>
  );
}
