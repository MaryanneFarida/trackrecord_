import { z } from "zod";

/** World Para Athletics classes for track running. */
export const SPORT_CLASSES = [
  { code: "T11", label: "T11 - vision impairment (no light perception)" },
  { code: "T12", label: "T12 - vision impairment" },
  { code: "T13", label: "T13 - vision impairment (least)" },
  { code: "T20", label: "T20 - intellectual impairment" },
  { code: "T35", label: "T35 - coordination impairment" },
  { code: "T36", label: "T36 - coordination impairment" },
  { code: "T37", label: "T37 - coordination impairment" },
  { code: "T38", label: "T38 - coordination impairment" },
  { code: "T40", label: "T40 - short stature" },
  { code: "T41", label: "T41 - short stature" },
  { code: "T42", label: "T42 - leg impairment, no prosthesis" },
  { code: "T43", label: "T43 - double below-knee" },
  { code: "T44", label: "T44 - single leg impairment" },
  { code: "T45", label: "T45 - double arm impairment" },
  { code: "T46", label: "T46 - single arm impairment" },
  { code: "T47", label: "T47 - single arm impairment (least)" },
  { code: "T51", label: "T51 - wheelchair racing" },
  { code: "T52", label: "T52 - wheelchair racing" },
  { code: "T53", label: "T53 - wheelchair racing" },
  { code: "T54", label: "T54 - wheelchair racing" },
  { code: "T61", label: "T61 - double above-knee, prosthesis" },
  { code: "T62", label: "T62 - double below-knee, prosthesis" },
  { code: "T63", label: "T63 - single above-knee, prosthesis" },
  { code: "T64", label: "T64 - single below-knee, prosthesis" },
] as const;

/**
 * TrackRecord's first version is built for athletes with PHYSICAL impairments
 * (coordination, short stature, limb differences, wheelchair racing, prostheses).
 * Visual and intellectual impairment classes are kept for existing records, but
 * new athletes and qualifiers can't use them until the voice-first version exists.
 */
const NOT_YET = ["T11", "T12", "T13", "T20"];
export const OFFERED_CLASSES = SPORT_CLASSES.filter((c) => !NOT_YET.includes(c.code));

export const EVENTS = ["100m", "200m", "400m", "800m", "1500m", "5000m", "10000m", "Marathon"] as const;


/** Images arrive as JPEG data URLs, already shrunk in the browser. */
const jpegDataUrl = z
  .string()
  .startsWith("data:image/jpeg;base64,")
  .max(480_000, "Photo too large");

export const applicationSchema = z
  .object({
    fullName: z.string().trim().min(3).max(80),
    licenceNo: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9/-]+$/, "Letters, numbers, / and - only"),
    sportClass: z.enum(OFFERED_CLASSES.map((c) => c.code) as [string, ...string[]]),
    events: z.array(z.enum(EVENTS)).min(1).max(4),
    guideRunner: z.boolean(),
    consent: z.literal(true),
    idPhoto: jpegDataUrl,
    selfie: jpegDataUrl,
  })
  .strict();

export type Application = z.infer<typeof applicationSchema>;

/** Decodes a JPEG data URL and checks it really is a JPEG (not just labelled as one). */
export function decodeJpeg(dataUrl: string): Buffer | null {
  const buf = Buffer.from(dataUrl.slice("data:image/jpeg;base64,".length), "base64");
  if (buf.length < 1000 || buf.length > 350_000) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null; // JPEG magic bytes
  return buf;
}

export type AthleteStatus = "pending" | "verified" | "rejected";

/**
 * The only reasons an application can be rejected. A fixed list keeps the
 * decision about identity, not opinion, and makes patterns easy to spot.
 */
export const REJECTION_REASONS = [
  { code: "photo_unclear", label: "A photo is too blurry or dark to check" },
  { code: "id_unreadable", label: "The name or photo on the ID can't be read" },
  { code: "id_mismatch", label: "The selfie doesn't match the ID photo" },
  { code: "name_mismatch", label: "The name given doesn't match the ID" },
  { code: "licence_not_found", label: "The licence number isn't in the federation register" },
  { code: "class_not_confirmed", label: "The sport class isn't confirmed by a classification record" },
  { code: "other", label: "Other (explained in the note)" },
] as const;

export type RejectionCode = (typeof REJECTION_REASONS)[number]["code"];
export const rejectionCodes = REJECTION_REASONS.map((r) => r.code) as [RejectionCode, ...RejectionCode[]];

export function rejectionLabel(code: string | null | undefined): string {
  return REJECTION_REASONS.find((r) => r.code === code)?.label ?? "No reason recorded";
}

/** Rules for a decision: approvals carry no reason; rejections need a listed reason, and "other" needs a note. */
export function checkDecision(d: { decision: "approve" | "reject"; reasonCode: string | null; note: string }): string | null {
  if (d.decision === "approve") return d.reasonCode === null && d.note === "" ? null : "approve_has_reason";
  if (!d.reasonCode || !(rejectionCodes as readonly string[]).includes(d.reasonCode)) return "reason_required";
  if (d.reasonCode === "other" && d.note.trim().length < 10) return "note_required";
  return null;
}
