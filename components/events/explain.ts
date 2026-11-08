import { explain } from "@/lib/passkeys/client";
import { RULE_MESSAGES } from "@/lib/events/rules";

/** Rule errors first (registration closed, reason too short...), then passkey errors. */
export function explainAction(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  return RULE_MESSAGES[code] ?? explain(err);
}
