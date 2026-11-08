import "server-only";
import { after } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { render, type Template } from "./templates";

export type { Template } from "./templates";

/**
 * notify(uid, template): emails the user, after the response has been sent.
 * Uses the free Resend API when RESEND_API_KEY is set; otherwise only logs,
 * so development works without email. Failure to notify never blocks an action:
 * the record itself is what counts. (Phase 9 adds web push.)
 */
export function notify(uid: string, template: Template, appUrl: string) {
  after(async () => {
    try {
      const user = await adminAuth().getUser(uid);
      if (!user.email) return;
      const { subject, text } = render(template, appUrl);
      const env = serverEnv();
      if (!env.RESEND_API_KEY) {
        console.info(`[notify] (no RESEND_API_KEY) to ${uid}: ${subject}`);
        return;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.RESEND_FROM, to: [user.email], subject, text }),
      });
      if (!res.ok) console.error(`[notify] Resend refused (${res.status}) for ${uid}`);
    } catch (err) {
      console.error("[notify] failed", err);
    }
  });
}

/** The site's own address, for links in emails. */
export function appUrlFrom(req: Request) {
  return new URL(req.url).origin;
}
