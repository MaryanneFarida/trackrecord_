/**
 * Every message TrackRecord sends, in plain language. Pure functions so they are tested.
 * Messages never include medical details, photos or secret links.
 */
export type Template =
  | { kind: "registration_confirmed"; eventName: string; races: string[]; lockTime: string }
  | { kind: "objection_received"; eventName: string; category: string; reason: string }
  | { kind: "objection_answered"; eventName: string; athleteName: string; response: string }
  | { kind: "checkin_refused"; eventName: string }
  | { kind: "result_locked" | "result_contested" | "result_decided"; eventName: string; race: string; seq: number }
  | { kind: "removal_proposed"; selectionName: string; race: string; ground: string; respondBy: string }
  | { kind: "removal_reviewed"; selectionName: string; race: string; approved: boolean; reason: string };

export function render(t: Template, appUrl: string): { subject: string; text: string } {
  switch (t.kind) {
    case "registration_confirmed":
      return {
        subject: `You're on the start list: ${t.eventName}`,
        text:
          `You are registered for ${t.races.join(", ")} at ${t.eventName}.\n\n` +
          `The start list seals at ${t.lockTime}. After that nobody can change it without a signed, public record.\n\n` +
          `See it at ${appUrl}/athlete`,
      };
    case "objection_received":
      return {
        subject: `A coach has objected to your entry: ${t.eventName}`,
        text:
          `A coach raised an objection about your entry for ${t.eventName}.\n\n` +
          `Category: ${t.category}\nReason given: ${t.reason}\n\n` +
          `You are STILL on the start list. An objection does not remove you. ` +
          `It is recorded permanently, and you can answer it at ${appUrl}/athlete`,
      };
    case "objection_answered":
      return {
        subject: `${t.athleteName} answered your objection: ${t.eventName}`,
        text: `${t.athleteName} answered your objection for ${t.eventName}:\n\n${t.response}\n\nSee it at ${appUrl}/coach`,
      };
    case "result_locked":
      return {
        subject: `Result locked: ${t.race} at ${t.eventName}`,
        text: `The coach's time and the athlete's time matched, so the ${t.race} result at ${t.eventName} is locked in public ledger record #${t.seq}. Anyone can check it at ${appUrl}/verify/${t.seq}`,
      };
    case "result_contested":
      return {
        subject: `Result contested: ${t.race} at ${t.eventName}`,
        text:
          `The coach's time and the athlete's time for ${t.race} at ${t.eventName} did not match. Both times are now on the public record (ledger record #${t.seq}) ` +
          `and neither can be changed. The tribunal decides contested results. See ${appUrl}/verify/${t.seq}`,
      };
    case "result_decided":
      return {
        subject: `Tribunal decision: ${t.race} at ${t.eventName}`,
        text: `The tribunal has ruled on the contested ${t.race} result at ${t.eventName}. The decision is public record #${t.seq}: ${appUrl}/verify/${t.seq}`,
      };
    case "removal_proposed":
      return {
        subject: `Proposed removal from ${t.selectionName}`,
        text:
          `The admin has proposed removing you from the ${t.race} places on ${t.selectionName}.\n\nReason: ${t.ground}\n\n` +
          `NOTHING HAS CHANGED YET. You are still on the list. You can respond until ${t.respondBy} at ${appUrl}/athlete, ` +
          `and an independent tribunal member must review it before it can take effect.`,
      };
    case "removal_reviewed":
      return {
        subject: t.approved ? `Removal approved: ${t.selectionName}` : `Removal rejected: you stay on ${t.selectionName}`,
        text: `${t.approved ? "A tribunal member approved" : "A tribunal member rejected"} the proposed removal from the ${t.race} places on ${t.selectionName}.\n\nTheir reason: ${t.reason}\n\nSee ${appUrl}/athlete`,
      };
    case "checkin_refused":
      return {
        subject: `Check-in refused at ${t.eventName}`,
        text:
          `An official refused your check-in at ${t.eventName} because the face check did not match.\n\n` +
          `If that was you, ask the head official for a second check now: every attempt is recorded and signed, ` +
          `and a refusal can be challenged at the tribunal. See ${appUrl}/athlete`,
      };
  }
}
