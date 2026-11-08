import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";
import { EVENTS, SPORT_CLASSES } from "@/lib/athletes/schema";
import { RECORD_TYPES } from "@/lib/ledger/chain";

/**
 * The shape of every Firestore collection, in one place.
 * Server routes validate with these before writing, so a bug can't store a
 * badly shaped record. Firestore paths are listed next to each schema.
 *
 * Rules that apply everywhere:
 * - Times are whole hundredths of a second (12.48 s -> 1248), never decimals,
 *   so "do the two times match?" is an exact comparison.
 * - Dates are ISO 8601 strings set by the server, never by the phone.
 * - Every record says who created it (a uid).
 */

const iso = z.string().datetime();
const uid = z.string().min(1).max(128);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const role = z.enum(ROLES);
const sportClass = z.enum(SPORT_CLASSES.map((c) => c.code) as [string, ...string[]]);
const event = z.enum(EVENTS);

/** A race time in hundredths of a second: 1 s to 6 h. */
export const timeHundredths = z.number().int().min(100).max(6 * 3600 * 100);

/** "12.48" or "1:52.07" or "2:05:31.00" -> hundredths. Returns null if malformed. */
export function parseTime(text: string): number | null {
  const m = text.trim().match(/^(?:(\d{1,2}):)?(?:(\d{1,2}):)?(\d{1,2})\.(\d{2})$/);
  if (!m) return null;
  const [, a, b, s, cs] = m;
  const hours = b !== undefined ? Number(a) : 0;
  const minutes = b !== undefined ? Number(b) : a !== undefined ? Number(a) : 0;
  if (Number(s) > 59 || minutes > 59) return null;
  return ((hours * 60 + minutes) * 60 + Number(s)) * 100 + Number(cs);
}

/** 1248 -> "12.48", 11207 -> "1:52.07" */
export function formatTime(h: number): string {
  const cs = h % 100;
  const totalS = Math.floor(h / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const hr = Math.floor(totalS / 3600);
  const two = (n: number) => String(n).padStart(2, "0");
  if (hr) return `${hr}:${two(m)}:${two(s)}.${two(cs)}`;
  if (m) return `${m}:${two(s)}.${two(cs)}`;
  return `${s}.${two(cs)}`;
}

// users/{uid}
export const userSchema = z.object({
  email: z.string().email().nullable(),
  role: role.nullable(),
  lastSignInAt: iso.optional(),
  passkeyCount: z.number().int().min(0).optional(),
  kmpdcNo: z.string().nullable().optional(),
});

// users/{uid}/passkeys/{credentialId}: see lib/passkeys/store.ts

// athletes/{uid}
export const athleteSchema = z.object({
  email: z.string().email().nullable(),
  fullName: z.string(),
  licenceNo: z.string(),
  sportClass,
  events: z.array(event),
  guideRunner: z.boolean(),
  consentAt: iso,
  status: z.enum(["pending", "verified", "rejected"]),
  submittedAt: iso,
  rejectionCode: z.string().nullable(),
  rejectionNote: z.string().nullable(),
});

// invites/{sha256 of token}
export const inviteSchema = z.object({
  role: role,
  email: z.string().email().nullable(),
  kmpdcNo: z.string().nullable(),
  note: z.string(),
  createdBy: uid,
  createdAt: iso,
  expiresAt: iso,
  usedBy: uid.nullable(),
  usedAt: iso.nullable(),
});

// events/{eventId}  (Phase 4)
export const eventSchema = z.object({
  name: z.string().min(3).max(80),
  venue: z.string().min(2).max(80),
  raceStart: iso,
  lockTime: iso, // raceStart - 24 h, set by the server
  entryWindowEnd: iso, // when result entry closes
  events: z.array(event).min(1),
  classes: z.array(sportClass).min(1),
  entryStandards: z.record(z.string(), timeHundredths), // e.g. { "T12-400m": 7000 }
  createdBy: uid,
  createdAt: iso,
  signedHash: hex64, // the admin's passkey-signed creation
  ledgerSeq: z.number().int(), // EVENT_CREATED record
  sealedAt: iso.nullable(), // set in the same transaction as the STARTLIST_SEALED record
  sealedSeq: z.number().int().optional(),
  listHash: hex64.optional(),
  count: z.number().int().optional(),
});

// startLists/{eventId}/athletes/{athleteId}  (Phase 4)
export const startListEntrySchema = z.object({
  athleteId: uid,
  fullName: z.string(), // shown to coaches and officials; not part of the sealed fingerprint
  sportClass,
  events: z.array(event).min(1),
  guideRunner: z.boolean(),
  registeredAt: iso,
  signedHash: hex64, // the athlete's passkey-signed registration
});

// objections/{id}  (Phase 4)
export const objectionSchema = z.object({
  eventId: z.string(),
  athleteId: uid,
  createdBy: uid, // the coach
  reasonCategory: z.enum(["eligibility", "classification", "identity", "other"]),
  reason: z.string().min(20).max(1000),
  createdAt: iso,
  signedHash: hex64,
  ledgerSeq: z.number().int(), // OBJECTION record (holds a fingerprint of the reason, not the text)
  response: z.string().max(1000).nullable(),
  respondedAt: iso.optional(),
  responseLedgerSeq: z.number().int().optional(),
});

// checkIns/{id}  (Phase 5)
export const checkInSchema = z.object({
  eventId: z.string(),
  athleteId: uid,
  officialId: uid,
  outcome: z.enum(["checked_in", "refused_code", "refused_face"]),
  guideRunnerId: uid.nullable(),
  at: iso,
  signedHash: hex64,
});

// entries/{id}  (Phase 6)
export const entrySchema = z.object({
  eventId: z.string(),
  race: event,
  athleteId: uid,
  createdBy: uid, // coach or the athlete
  by: z.enum(["coach", "athlete"]),
  timeHundredths,
  signedAt: iso,
  receivedAt: iso,
  late: z.boolean(),
  signedHash: hex64,
});

// ledger/{seq} and ledgerHead/head  (Phase 3)
export const ledgerRecordSchema = z.object({
  seq: z.number().int().min(1),
  type: z.enum(RECORD_TYPES),
  payload: z.record(z.string(), z.unknown()),
  prevHash: hex64,
  createdAt: iso,
  keyId: z.string(),
  hash: hex64,
  sysSig: z.string(),
});
export const ledgerHeadSchema = z.object({ seq: z.number().int().min(0), hash: hex64 });

// removals/{id}  (Phase 7): public fields only
export const removalSchema = z.object({
  eventSeason: z.string(),
  athleteId: uid,
  category: z.enum(["injury", "withdrawal", "eligibility", "other"]),
  requestedBy: uid,
  medicalReportHash: hex64.nullable(),
  createdAt: iso,
  ledgerSeq: z.number().int(),
});

// auditLog/{id}
export const auditSchema = z.object({ action: z.string(), uid: z.string().optional(), at: iso }).passthrough();

export type User = z.infer<typeof userSchema>;
export type Athlete = z.infer<typeof athleteSchema>;
export type Invite = z.infer<typeof inviteSchema>;
export type TrackEvent = z.infer<typeof eventSchema>;
export type StartListEntry = z.infer<typeof startListEntrySchema>;
export type Objection = z.infer<typeof objectionSchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type LedgerRecordDoc = z.infer<typeof ledgerRecordSchema>;
export type Removal = z.infer<typeof removalSchema>;
