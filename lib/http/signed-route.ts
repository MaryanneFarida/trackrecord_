import "server-only";
import { z } from "zod";
import { apiSession } from "@/lib/auth/api";
import type { Session } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { verifySignedAction } from "@/lib/passkeys/signed-action";
import { isFresh } from "@/lib/events/rules";

export const fail = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * The common start of every passkey-signed route: right role, same site,
 * well-formed payload, recent, and signed by one of this user's passkeys
 * over exactly this payload.
 */
export async function signedRequest<S extends z.ZodType<{ action: string; at: string }>>(
  req: Request,
  role: Role,
  schema: S,
): Promise<{ session: Session; p: z.infer<S>; signedHash: string; passkeyId: string } | Response> {
  const session = await apiSession(req, role);
  if (session instanceof Response) return session;
  const raw = (await req.json().catch(() => null)) as { payload?: unknown; assertion?: unknown } | null;
  const parsed = schema.safeParse(raw?.payload);
  if (!parsed.success || !raw?.assertion) return fail("bad_request");
  const p = parsed.data as z.infer<S>;
  if (!isFresh(p.at, Date.now())) return fail("stale");
  const signed = await verifySignedAction({ req, session, payload: p as Record<string, unknown>, assertion: raw.assertion as Parameters<typeof verifySignedAction>[0]["assertion"], action: p.action });
  if (!signed.ok) return fail(signed.error);
  return { session, p, signedHash: signed.actionHash, passkeyId: signed.passkeyId };
}
