/**
 * Every message TrackRecord sends, in plain language. Pure functions so they are tested.
 * Messages never include medical details, photos or secret links.
 */
export type Template =
  | { kind: "registration_confirmed"; eventName: string; races: string[]; lockTime: string }
  | { kind: "objection_received"; eventName: string; category: string; reason: string }
  | { kind: "objection_answered"; eventName: string; athleteName: string; response: string };

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
  }
}
