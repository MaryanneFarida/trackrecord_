import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { redirect } from "next/navigation";
import { isRole, type Role } from "@/lib/auth/roles";

/**
 * Sessions: the browser never keeps a Firebase token. After sign-in the
 * server swaps the ID token for an httpOnly session cookie, which page code
 * can't read (so a script injected into the page can't steal it).
 */
export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days

export interface Session {
  uid: string;
  email: string | null;
  role: Role | null;
}

/** The signed-in user, or null. Checks the cookie AND whether it was revoked. */
export async function getSession(): Promise<Session | null> {
  await connection(); // always check at request time, never from a prerendered copy
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(value, true);
    return { uid: decoded.uid, email: decoded.email ?? null, role: isRole(decoded.role) ? decoded.role : null };
  } catch {
    return null; // expired, revoked or forged
  }
}

/**
 * Use at the top of EVERY page component and data function in a role area.
 * The layout guard alone is not enough: Next.js prerenders a page's static
 * parts separately from its layout, so each page must check for itself.
 */
export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=/${role}`);
  if (session.role !== role) redirect("/no-access");
  return session;
}
