"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signedPost } from "@/lib/passkeys/signed";
import { explain } from "@/lib/passkeys/client";
import { SELECTION_MESSAGES } from "@/lib/selection/rules";
import { RESULT_MESSAGES } from "@/lib/results/rules";
import { RULE_MESSAGES } from "@/lib/events/rules";

/** Shared by every signed form: passkey prompt, busy state, plain-language errors, page refresh. */
export function useSigned() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run<T = unknown>(url: string, payload: Record<string, unknown>, success: (res: T) => string) {
    setBusy(true);
    setMessage("Confirm with your passkey...");
    try {
      const res = await signedPost<T>(url, { ...payload, at: new Date().toISOString() });
      setMessage(success(res));
      router.refresh();
      return true;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setMessage(SELECTION_MESSAGES[code] ?? RESULT_MESSAGES[code] ?? RULE_MESSAGES[code] ?? explain(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, setMessage, run };
}
