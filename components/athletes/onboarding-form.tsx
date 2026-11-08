"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENTS, SPORT_CLASSES } from "@/lib/athletes/schema";

/** Shrinks a photo in the browser (max 1024 px, JPEG) so it uploads fast on mobile data. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.75, 0.6, 0.45]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 450_000) return url;
  }
  throw new Error("Photo is too large even after shrinking.");
}

function PhotoField(props: { id: string; label: string; hint: string; capture: "user" | "environment"; value: string; onChange: (v: string) => void }) {
  const [error, setError] = useState("");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <p id={`${props.id}-hint`} className="text-sm text-muted-foreground">{props.hint}</p>
      <input
        id={props.id}
        type="file"
        accept="image/*"
        capture={props.capture}
        aria-describedby={`${props.id}-hint`}
        className="block w-full text-base file:mr-3 file:h-11 file:rounded-md file:border file:bg-background file:px-4"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            setError("");
            props.onChange(await shrink(f));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't read that photo.");
          }
        }}
      />
      {props.value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.value} alt={`Preview: ${props.label}`} className="mt-2 max-h-48 rounded-md border" />
      ) : null}
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    </div>
  );
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [licenceNo, setLicenceNo] = useState("");
  const [sportClass, setSportClass] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [guideRunner, setGuideRunner] = useState(false);
  const [consent, setConsent] = useState(false);
  const [idPhoto, setIdPhoto] = useState("");
  const [selfie, setSelfie] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!idPhoto || !selfie) return setMessage("Please add both photos.");
    if (events.length === 0) return setMessage("Choose at least one event.");
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, licenceNo, sportClass, events, guideRunner, consent, idPhoto, selfie }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setMessage("Your application couldn't be sent. Check every field and try again.");
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name (as on your ID)</Label>
        <Input id="fullName" required className="h-11 text-base" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="licenceNo">Federation licence number</Label>
        <Input id="licenceNo" required className="h-11 text-base" value={licenceNo} onChange={(e) => setLicenceNo(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sportClass">Sport class</Label>
        <select
          id="sportClass"
          required
          className="h-11 w-full rounded-md border bg-background px-3 text-base"
          value={sportClass}
          onChange={(e) => setSportClass(e.target.value)}
        >
          <option value="">Choose your class</option>
          {SPORT_CLASSES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Events (up to 4)</legend>
        <div className="grid grid-cols-2 gap-2">
          {EVENTS.map((ev) => (
            <label key={ev} className="flex min-h-11 items-center gap-2 rounded-md border px-3">
              <input
                type="checkbox"
                className="size-5"
                checked={events.includes(ev)}
                disabled={!events.includes(ev) && events.length >= 4}
                onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))}
              />
              {ev}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5" checked={guideRunner} onChange={(e) => setGuideRunner(e.target.checked)} />
        I race with a guide runner
      </label>
      <PhotoField id="idPhoto" label="Photo of your national ID" hint="The side with your photo and name. Make sure it's readable." capture="environment" value={idPhoto} onChange={setIdPhoto} />
      <PhotoField id="selfie" label="A selfie" hint="Face the camera in good light. The admin compares it with your ID." capture="user" value={selfie} onChange={setSelfie} />
      <label className="flex items-start gap-2 rounded-md border p-3">
        <input type="checkbox" required className="mt-1 size-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I agree that TrackRecord stores my ID photo and selfie, encrypted, to verify my identity, as allowed under
          Kenya&apos;s Data Protection Act 2019. Only the federation admin can view them.
        </span>
      </label>
      <Button type="submit" className="h-11 w-full text-base" disabled={busy}>
        {busy ? "Sending..." : "Send my application"}
      </Button>
      <p role="status" aria-live="polite" className="text-destructive">{message}</p>
    </form>
  );
}
