"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { explain } from "@/lib/passkeys/client";
import { CHECKIN_MESSAGES } from "@/lib/checkin/rules";
import { RULE_MESSAGES } from "@/lib/events/rules";

interface Found {
  athleteId: string;
  fullName: string;
  sportClass: string;
  events: string[];
  guideRunner: boolean;
  selfie: string | null;
}

const explainAny = (err: unknown) => {
  const code = err instanceof Error ? err.message : "";
  return CHECKIN_MESSAGES[code] ?? RULE_MESSAGES[code] ?? explain(err);
};

/**
 * The official's check-in desk: scan the athlete's code, compare the face with
 * the verified selfie, then sign "checked in" or "face doesn't match".
 */
export function CheckInDesk({ events }: { events: { id: string; name: string; roster: { athleteId: string; fullName: string }[] }[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [scanning, setScanning] = useState(false);
  const [manualAthlete, setManualAthlete] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [found, setFound] = useState<{ athlete: Found; scanToken: string } | null>(null);
  const [guideName, setGuideName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const lookingUp = useRef(false);

  async function lookup(qr: string) {
    if (lookingUp.current) return;
    lookingUp.current = true;
    setMessage("Checking the code...");
    try {
      const res = await fetch("/api/checkin/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qr, eventId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(CHECKIN_MESSAGES[data.error] ?? `Couldn't check that code (code: ${data.error ?? res.status}).`);
        return;
      }
      setScanning(false);
      setFound(data);
      setGuideName("");
      setManualCode("");
      setMessage("");
    } catch {
      setMessage("No connection. Try again.");
    } finally {
      setTimeout(() => (lookingUp.current = false), 1500); // don't re-read the same code many times a second
    }
  }

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        video.current.play().catch(() => {});
        timer = setInterval(() => {
          const v = video.current;
          if (!v || !ctx || v.readyState < 2) return;
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (hit?.data.startsWith("TR1.")) lookup(hit.data);
        }, 300);
      })
      .catch(() => setMessage("The camera couldn't start. Allow camera access, or type the athlete's code below."));
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, eventId]);

  async function decide(outcome: "checked_in" | "refused_face") {
    if (!found) return;
    if (outcome === "checked_in" && found.athlete.guideRunner && guideName.trim().length < 2) return setMessage(CHECKIN_MESSAGES.guide_required);
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      await signedPost("/api/checkin/decide", {
        action: "checkin.decide",
        eventId,
        athleteId: found.athlete.athleteId,
        outcome,
        guideName: guideName.trim(),
        scanToken: found.scanToken,
        at: new Date().toISOString(),
      });
      setMessage(outcome === "checked_in" ? `${found.athlete.fullName} is checked in.` : `Refusal recorded. ${found.athlete.fullName} has been told and can ask for a second check.`);
      setFound(null);
    } catch (err) {
      setMessage(explainAny(err));
    } finally {
      setBusy(false);
    }
  }

  if (events.length === 0) return <p className="text-muted-foreground">No qualifier has check-in open right now. Check-in opens when a start list is sealed.</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="desk-event">Qualifier</Label>
        <select id="desk-event" className="h-11 w-full rounded-md border bg-background px-3 text-base" value={eventId} onChange={(e) => { setEventId(e.target.value); setFound(null); }}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {!found ? (
        <div className="space-y-3">
          {scanning ? (
            <>
              <video ref={video} className="w-full rounded-md bg-black" muted playsInline aria-label="Camera view for scanning" />
              <Button variant="outline" className="min-h-11" onClick={() => setScanning(false)}>Stop camera</Button>
            </>
          ) : (
            <Button className="min-h-12 px-5 text-base" onClick={() => { setMessage(""); setScanning(true); }}>Scan an athlete&apos;s code</Button>
          )}
          <form
            className="space-y-2 rounded-md border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualAthlete && /^\d{6}$/.test(manualCode)) lookup(`TR1.${eventId}.${manualAthlete}.${manualCode}`);
              else setMessage("Choose the athlete and type the 6-digit code from their screen.");
            }}
          >
            <p className="text-sm font-medium">Camera not working? Type the code instead</p>
            <div className="space-y-1.5">
              <Label htmlFor="desk-athlete">Athlete</Label>
              <select id="desk-athlete" className="h-11 w-full rounded-md border bg-background px-3 text-base" value={manualAthlete} onChange={(e) => setManualAthlete(e.target.value)}>
                <option value="">Choose from the sealed start list</option>
                {(events.find((e) => e.id === eventId)?.roster ?? []).map((a) => (
                  <option key={a.athleteId} value={a.athleteId}>{a.fullName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desk-code">6-digit code on their screen</Label>
              <Input id="desk-code" inputMode="numeric" maxLength={6} className="h-11 font-mono text-lg tracking-widest" value={manualCode} onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))} />
            </div>
            <Button type="submit" variant="outline" className="min-h-11">Check code</Button>
          </form>
        </div>
      ) : (
        <article className="space-y-4 rounded-lg border-2 p-4" aria-label={`Face check for ${found.athlete.fullName}`}>
          <h3 className="text-xl font-semibold">Face check: {found.athlete.fullName}</h3>
          <p>
            Class {found.athlete.sportClass} - {found.athlete.events.join(", ")}
            {found.athlete.guideRunner ? " - races with a guide runner" : ""}
          </p>
          {found.athlete.selfie ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={found.athlete.selfie} alt={`Verified selfie of ${found.athlete.fullName}`} className="w-full max-w-sm rounded-md border" />
          ) : (
            <p role="alert" className="text-destructive">No verified photo could be shown. Do not check this athlete in; call the head official.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Look at the person in front of you. Is this the same person as the verified photo? You have 3 minutes.
          </p>
          {found.athlete.guideRunner ? (
            <div className="space-y-1.5">
              <Label htmlFor="desk-guide">Guide runner&apos;s full name</Label>
              <Input id="desk-guide" className="h-11 text-base" value={guideName} onChange={(e) => setGuideName(e.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button className="min-h-12 px-5 text-base" disabled={busy || !found.athlete.selfie} onClick={() => decide("checked_in")}>Same person: check in</Button>
            <Button variant="destructive" className="min-h-12 px-5 text-base" disabled={busy} onClick={() => decide("refused_face")}>Face doesn&apos;t match</Button>
            <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => setFound(null)}>Cancel</Button>
          </div>
        </article>
      )}
      <p role="status" aria-live="polite" className="text-base">{message}</p>
    </div>
  );
}
