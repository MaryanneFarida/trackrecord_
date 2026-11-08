import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, getSession } from "@/lib/auth/session";
import { homeFor, isRole } from "@/lib/auth/roles";

const body = z.object({ idToken: z.string().min(10) }).strict();

/** Same-site check: only our own pages may create or end a session (CSRF protection). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** POST: swap a fresh Firebase ID token for a session cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "bad_origin" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);
    // Only accept a sign-in that just happened (stolen old tokens are useless).
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return Response.json({ error: "sign_in_again" }, { status: 401 });
    }
    const cookie = await adminAuth().createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });
    (await cookies()).set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    const role = isRole(decoded.role) ? decoded.role : null;
    // Keep a simple user record (the admin's user list reads it in Phase 1C).
    // Written after the response is sent, so a slow or failed write never blocks sign-in.
    after(async () => {
      await adminDb()
        .collection("users")
        .doc(decoded.uid)
        .set({ email: decoded.email ?? null, role, lastSignInAt: new Date().toISOString() }, { merge: true })
        .catch((err) => console.error("users record not saved", err));
    });

    return Response.json({ ok: true, home: homeFor(role) });
  } catch {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }
}

/** DELETE: sign out everywhere (clears the cookie and revokes all sessions for this user). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "bad_origin" }, { status: 403 });
  const session = await getSession();
  if (session) await adminAuth().revokeRefreshTokens(session.uid);
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
