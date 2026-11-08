import { z } from "zod";
import { EVENTS } from "@/lib/athletes/schema";
import { timeHundredths } from "@/lib/schemas";

/**
 * Results: the coach and the athlete each enter the time, separately, signed
 * with their own passkeys. If the two match to the hundredth, the result locks
 * into the public ledger. If not, it is marked CONTESTED with both times on the
 * record, and neither can change their entry afterwards.
 */
export const SIDES = ["coach", "athlete"] as const;
export type Side = (typeof SIDES)[number];

export const resultPayload = z
  .object({
    action: z.literal("result.enter"),
    eventId: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/),
    race: z.enum(EVENTS),
    athleteId: z.string().min(1).max(128),
    hundredths: timeHundredths,
    at: z.string().datetime(),
  })
  .strict();

export const resultId = (eventId: string, race: string, athleteId: string) => `${eventId}_${race}_${athleteId}`;
export const entryId = (eventId: string, race: string, athleteId: string, side: Side) => `${resultId(eventId, race, athleteId)}_${side}`;

/** Results can be entered for athletes who checked in, until 24 hours after the race. */
export function canEnter(args: {
  side: Side;
  sessionUid: string;
  athleteId: string;
  onList: boolean;
  racesEntered: string[];
  race: string;
  checkedIn: boolean;
  entryWindowEnd: string;
  now: number;
}): string | null {
  if (args.side === "athlete" && args.sessionUid !== args.athleteId) return "not_your_result";
  if (!args.onList || !args.racesEntered.includes(args.race)) return "not_in_race";
  if (!args.checkedIn) return "not_checked_in";
  if (args.now >= Date.parse(args.entryWindowEnd)) return "entry_closed";
  return null;
}

export function decide(coach: number, athlete: number): "RESULT_LOCKED" | "RESULT_CONTESTED" {
  return coach === athlete ? "RESULT_LOCKED" : "RESULT_CONTESTED";
}

export const RESULT_MESSAGES: Record<string, string> = {
  not_your_result: "Athletes can only enter their own time.",
  not_in_race: "This athlete isn't entered in that race.",
  not_checked_in: "Results can only be entered for athletes who checked in.",
  entry_closed: "The 24-hour window for entering this result has closed.",
  already_entered: "You've already entered this time. Signed entries can't be changed; if it's wrong, the result will be contested.",
  bad_time: "Write the time like 12.48, 1:52.07 or 2:05:31.00.",
};
