import { z } from "zod";
import { HOUR } from "@/lib/events/rules";

/**
 * Check-in rules. Check-in opens once the start list is sealed and closes
 * 8 hours after the first race. Only athletes on the SEALED list can check in,
 * and only a neutral official (not a coach) can check them in, after comparing
 * the face in front of them with the verified selfie.
 */
export const CHECKIN_CLOSES_AFTER_RACE_MS = 8 * HOUR;

export const checkInCloses = (raceStart: string) => new Date(Date.parse(raceStart) + CHECKIN_CLOSES_AFTER_RACE_MS).toISOString();

export function checkInOpen(ev: { sealedAt?: string | null; raceStart: string }, now: number) {
  return Boolean(ev.sealedAt) && now < Date.parse(checkInCloses(ev.raceStart));
}

export function dueForCheckInSummary(ev: { sealedAt?: string | null; raceStart: string; checkInSummarySeq?: number | null }, now: number) {
  return Boolean(ev.sealedAt) && !ev.checkInSummarySeq && now >= Date.parse(checkInCloses(ev.raceStart));
}

export const OUTCOMES = ["checked_in", "refused_face"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Signed by the official. No trimming here: it must hash exactly as signed. */
export const checkInPayload = z
  .object({
    action: z.literal("checkin.decide"),
    eventId: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/),
    athleteId: z.string().min(1).max(128),
    outcome: z.enum(OUTCOMES),
    guideName: z.string().max(80), // empty if no guide runner
    scanToken: z.string().min(10).max(600),
    at: z.string().datetime(),
  })
  .strict();

/** The status document id: one per athlete per event. */
export const statusId = (eventId: string, athleteId: string) => `${eventId}_${athleteId}`;

export interface CheckInAttempt {
  athleteId: string;
  outcome: Outcome;
  signedHash: string;
}

/** The end-of-check-in summary that goes into the ledger. Order of attempts doesn't matter. */
export function summarise(onList: string[], attempts: CheckInAttempt[]) {
  const checkedIn = new Set(attempts.filter((a) => a.outcome === "checked_in").map((a) => a.athleteId));
  const refused = [...new Set(attempts.filter((a) => a.outcome === "refused_face" && !checkedIn.has(a.athleteId)).map((a) => a.athleteId))].sort();
  return {
    checkedIn: [...checkedIn].sort(),
    refusedFace: refused,
    noShow: onList.filter((id) => !checkedIn.has(id) && !refused.includes(id)).sort(),
    attemptHashes: attempts.map((a) => a.signedHash).sort(),
  };
}

export const CHECKIN_MESSAGES: Record<string, string> = {
  bad_qr: "That isn't a TrackRecord check-in code.",
  wrong_event: "This code is for a different qualifier.",
  bad_code: "The code has expired or is wrong. Ask the athlete to keep the code screen open and scan again.",
  not_on_list: "This athlete is not on the sealed start list.",
  checkin_closed: "Check-in is not open for this qualifier.",
  already_checked_in: "This athlete is already checked in.",
  scan_expired: "More than 3 minutes passed since the scan. Scan the code again.",
  guide_required: "Enter the guide runner's name.",
};
