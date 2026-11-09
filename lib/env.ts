import "server-only";
import { z } from "zod";

/** Server secrets, checked once. A missing secret stops the app instead of running insecurely. */
const schema = z.object({
  FIREBASE_SERVICE_ACCOUNT: z.string().min(1),
  SIGNING_PRIVATE_KEY: z.string().includes("PRIVATE KEY"),
  SIGNING_PUBLIC_KEY: z.string().includes("PUBLIC KEY"),
  SIGNING_KEY_ID: z.string().min(1),
  FILE_ENCRYPTION_KEY: z.string().length(64),
  TOTP_MASTER_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().optional(),
  // Resend's test sender only delivers to your own Resend account email. Verify a domain to email everyone.
  // How long an athlete has to answer a proposed removal. 4320 = 72 hours. A smaller number is DEMO MODE and is shown on screen.
  REMOVAL_RESPONSE_MINUTES: z.coerce.number().int().min(1).max(10080).default(4320),
  // Opens /judges, the sign-in door to the five demo accounts. Unset = the door is closed.
  JUDGE_ACCESS_CODE: z.string().min(12).optional(),
  RESEND_FROM: z.string().default("TrackRecord <onboarding@resend.dev>"),
});

export type ServerEnv = z.infer<typeof schema>;
let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`TrackRecord server environment is incomplete:\n${missing}`);
  }
  cached = {
    ...parsed.data,
    SIGNING_PRIVATE_KEY: parsed.data.SIGNING_PRIVATE_KEY.replace(/\\n/g, "\n"),
    SIGNING_PUBLIC_KEY: parsed.data.SIGNING_PUBLIC_KEY.replace(/\\n/g, "\n"),
  };
  return cached;
}
