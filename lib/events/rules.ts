import { z } from "zod";
import { EVENTS, SPORT_CLASSES } from "@/lib/athletes/schema";

/**
 * The fixed rules for qualifiers, start lists and objections.
 * Pure functions (no database), so every rule is unit-tested.
 *
 * Timeline of one qualifier:
 *   created ... registration open ... lockTime (raceStart - 24 h): list sealed ... raceStart ... entryWindowEnd (raceStart + 24 h)
 */

export const HOUR = 60 * 60 * 1000;
export const LOCK_BEFORE_RACE_MS = 24 * HOUR;
export const ENTRY_WINDOW_AFTER_RACE_MS = 24 * HOUR;
/** Sealing waits one minute past lockTime, so a registration that was already in flight can't land after the seal. */
export const SEAL_GRACE_MS = 60 * 1000;
/** An event must leave at least this long for registration. */
export const MIN_REGISTRATION_WINDOW_MS = 5 * 60 * 1000;
/** A signed request older than this is refused (stops replaying an old signature). */
export const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;

const classCodes = SPORT_CLASSES.map((c) => c.code) as [string, ...string[]];

export function deriveTimes(raceStartIso: string) {
  const start = Date.parse(raceStartIso);
  return {
    lockTime: new Date(start - LOCK_BEFORE_RACE_MS).toISOString(),
    entryWindowEnd: new Date(start + ENTRY_WINDOW_AFTER_RACE_MS).toISOString(),
  };
}

export const isFresh = (at: string, now: number) => Math.abs(now - Date.parse(at)) <= MAX_SIGNATURE_AGE_MS;

// ---------- Signed payloads (NO trim/lowercase transforms: they must hash exactly as the user signed) ----------

const eventId = z.string().regex(/^[A-Za-z0-9_-]{6,40}$/);
const athleteUid = z.string().min(1).max(128);
const races = z.array(z.enum(EVENTS)).min(1).max(4);

export const eventCreatePayload = z
  .object({
    action: z.literal("event.create"),
    name: z.string().min(3).max(80),
    venue: z.string().min(2).max(80),
    raceStart: z.string().datetime(),
    races: z.array(z.enum(EVENTS)).min(1).max(EVENTS.length), // a qualifier can host every race; an athlete enters at most 4
    classes: z.array(z.enum(classCodes)).min(1).max(SPORT_CLASSES.length),
    at: z.string().datetime(),
  })
  .strict();

export const registrationPayload = z
  .object({ action: z.literal("registration.create"), eventId, races, at: z.string().datetime() })
  .strict();

export const OBJECTION_CATEGORIES = [
  { code: "eligibility", label: "Eligibility (licence, age, residency)" },
  { code: "classification", label: "Sport class looks wrong" },
  { code: "identity", label: "Identity (this may not be the registered athlete)" },
  { code: "other", label: "Other" },
] as const;
const categoryCodes = OBJECTION_CATEGORIES.map((c) => c.code) as [string, ...string[]];
export const categoryLabel = (code: string) => OBJECTION_CATEGORIES.find((c) => c.code === code)?.label ?? code;

export const objectionPayload = z
  .object({
    action: z.literal("objection.create"),
    eventId,
    athleteId: athleteUid,
    category: z.enum(categoryCodes),
    reason: z.string().max(1000),
    at: z.string().datetime(),
  })
  .strict();

export const objectionResponsePayload = z
  .object({
    action: z.literal("objection.respond"),
    objectionId: z.string().min(1).max(300),
    response: z.string().max(1000),
    at: z.string().datetime(),
  })
  .strict();

/** Lengths are checked on the trimmed text, but the signed text itself is never changed. */
export const MIN_REASON = 20;
export const MIN_RESPONSE = 10;
export const longEnough = (text: string, min: number) => text.trim().length >= min;

// ---------- Rules ----------

export interface EventRules {
  raceStart: string;
  lockTime: string;
  events: string[];
  classes: string[];
  sealedAt?: string | null;
}

export function checkNewEvent(p: { raceStart: string; races: string[]; classes: string[] }, now: number): string | null {
  if (new Set(p.races).size !== p.races.length || new Set(p.classes).size !== p.classes.length) return "duplicates";
  const lock = Date.parse(deriveTimes(p.raceStart).lockTime);
  if (lock - now < MIN_REGISTRATION_WINDOW_MS) return "too_soon"; // race must be more than 24 h + 5 min away
  if (Date.parse(p.raceStart) - now > 366 * 24 * HOUR) return "too_far";
  return null;
}

export function registrationOpen(ev: EventRules, now: number) {
  return !ev.sealedAt && now < Date.parse(ev.lockTime);
}

export function dueForSealing(ev: EventRules, now: number) {
  return !ev.sealedAt && now >= Date.parse(ev.lockTime) + SEAL_GRACE_MS;
}

/**
 * The automatic registration rule. If the athlete is verified, their class is
 * offered, the races are on the programme and are in their profile, and the
 * list isn't locked, they are IN. Nobody approves it, so nobody can quietly refuse it.
 */
export function canRegister(args: {
  athlete: { status: string; sportClass: string; events: string[] } | null;
  event: EventRules;
  races: string[];
  alreadyRegistered: boolean;
  now: number;
}): string | null {
  const { athlete, event, races: wanted, now } = args;
  if (!athlete || athlete.status !== "verified") return "athlete_not_verified";
  if (!registrationOpen(event, now)) return "registration_closed";
  if (args.alreadyRegistered) return "already_registered";
  if (!event.classes.includes(athlete.sportClass)) return "class_not_offered";
  if (new Set(wanted).size !== wanted.length) return "duplicates";
  if (!wanted.every((r) => event.events.includes(r))) return "race_not_offered";
  if (!wanted.every((r) => athlete.events.includes(r))) return "race_not_in_profile";
  return null;
}

/** Objections are allowed until the race starts. They never remove anyone. */
export function canObject(args: {
  event: EventRules;
  onList: boolean;
  reason: string;
  now: number;
}): string | null {
  if (!args.onList) return "not_on_list";
  if (args.now >= Date.parse(args.event.raceStart)) return "race_started";
  if (!longEnough(args.reason, MIN_REASON)) return "reason_too_short";
  return null;
}

/** One objection per coach, per athlete, per event (stops harassment by repeated objections). */
export const objectionId = (eventId: string, athleteId: string, coachId: string) => `${eventId}_${athleteId}_${coachId}`;

/** What gets fingerprinted when the list is sealed: sorted by athlete, so order of arrival doesn't matter. */
export interface SealedEntry {
  athleteId: string;
  sportClass: string;
  events: string[];
  signedHash: string;
}
export function sealedListBody(entries: SealedEntry[]): SealedEntry[] {
  return [...entries]
    .map((e) => ({ athleteId: e.athleteId, sportClass: e.sportClass, events: [...e.events].sort(), signedHash: e.signedHash }))
    .sort((a, b) => (a.athleteId < b.athleteId ? -1 : a.athleteId > b.athleteId ? 1 : 0));
}

/** Plain-language messages for every error code above. */
export const RULE_MESSAGES: Record<string, string> = {
  athlete_not_verified: "Your athlete profile must be verified before you can register.",
  registration_closed: "Registration has closed: the start list locks 24 hours before the race.",
  already_registered: "You are already on this start list.",
  class_not_offered: "Your sport class isn't on this qualifier's programme.",
  race_not_offered: "One of those races isn't on this qualifier's programme.",
  race_not_in_profile: "You can only enter races listed in your athlete profile.",
  duplicates: "A race or class was listed twice.",
  not_on_list: "That athlete isn't on this start list.",
  race_started: "The race has started. Raise it with the tribunal instead.",
  reason_too_short: `Give a reason of at least ${MIN_REASON} characters. The athlete and the tribunal will read it.`,
  response_too_short: `Write at least ${MIN_RESPONSE} characters.`,
  already_objected: "You have already objected to this athlete for this qualifier.",
  already_answered: "You have already answered this objection.",
  too_soon: "The race must be more than 24 hours and 5 minutes away, so athletes have time to register.",
  too_far: "The race must be within the next year.",
  not_found: "Not found.",
  stale: "That request is too old. Please try again.",
  bad_request: "The form was rejected. Check every field and try again.",
};

/** Dates shown in Kenyan time, whatever the server's time zone. */
export function formatEAT(iso: string) {
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso)) + " EAT";
}
