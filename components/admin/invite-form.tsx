"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedPost } from "@/lib/passkeys/signed";
import { explain } from "@/lib/passkeys/client";

const ROLES = [
  { value: "coach", label: "Coach" },
  { value: "official", label: "Venue official" },
  { value: "doctor", label: "Doctor" },
  { value: "tribunal", label: "Tribunal member" },
  { value: "admin", label: "Federation admin" },
];

export function InviteForm() {
  const router = useRouter();
  const [role, setRole] = useState("coach");
  const [email, setEmail] = useState("");
  const [kmpdcNo, setKmpdcNo] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (role === "doctor" && !kmpdcNo.trim()) return setMessage("Enter the doctor's KMPDC registration number (check it on the KMPDC register first).");
    setBusy(true);
    setLink("");
    setMessage("Confirm with your passkey...");
    try {
      const res = await signedPost<{ link: string }>("/api/admin/invites", {
        action: "invite.create",
        role,
        email: email.trim() ? email.trim().toLowerCase() : null,
        kmpdcNo: role === "doctor" ? kmpdcNo.trim() : null,
        note: note.trim(),
        at: new Date().toISOString(),
      });
      setLink(res.link);
      setMessage("Invite created. Send this link to the person. It works once, for 7 days, and won't be shown again.");
      setEmail("");
      setKmpdcNo("");
      setNote("");
      router.refresh();
    } catch (err) {
      setMessage(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select id="invite-role" className="h-11 w-full rounded-md border bg-background px-3 text-base" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Their email (recommended: only this address can accept)</Label>
        <Input id="invite-email" type="email" className="h-11 text-base" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {role === "doctor" ? (
        <div className="space-y-1.5">
          <Label htmlFor="invite-kmpdc">KMPDC registration number</Label>
          <Input id="invite-kmpdc" className="h-11 text-base" value={kmpdcNo} onChange={(e) => setKmpdcNo(e.target.value)} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="invite-note">Note (for your records, e.g. &quot;Nakuru region coach&quot;)</Label>
        <Input id="invite-note" className="h-11 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" className="min-h-11 px-5 text-base" disabled={busy}>Create invite link</Button>
      <p role="status" aria-live="polite">{message}</p>
      {link ? (
        <div className="space-y-2">
          <Input readOnly value={link} aria-label="Invite link" className="h-11 font-mono text-sm" onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(link)}>Copy link</Button>
        </div>
      ) : null}
    </form>
  );
}
