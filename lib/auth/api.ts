import "server-only";
import { getSession, type Session } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";

/** Same-site check for every state-changing API route (CSRF protection). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** For API routes: returns the session, or a ready-made error response. role=null means "any signed-in user". */
export async function apiSession(req: Request, role: Role | null): Promise<Session | Response> {
  if (!sameOrigin(req)) return Response.json({ error: "bad_origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  if (role && session.role !== role) return Response.json({ error: "forbidden" }, { status: 403 });
  return session;
}
