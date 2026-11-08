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

export const EVENTS = ["100m", "200m", "400m", "800m", "1500m", "5000m", "10000m", "Marathon"] as const;

const classCodes = SPORT_CLASSES.map((c) => c.code) as [string, ...string[]];

/** Images arrive as JPEG data URLs, already shrunk in the browser. */
const jpegDataUrl = z
  .string()
  .startsWith("data:image/jpeg;base64,")
  .max(480_000, "Photo too large");

export const applicationSchema = z
  .object({
    fullName: z.string().trim().min(3).max(80),
    licenceNo: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9/-]+$/, "Letters, numbers, / and - only"),
    sportClass: z.enum(classCodes),
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
