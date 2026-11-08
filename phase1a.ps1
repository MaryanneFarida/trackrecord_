# TrackRecord Phase 1A: sign-in, sessions, roles and role guards.
# Run from the trackrecord_ folder:  powershell -ExecutionPolicy Bypass -File .\phase1a.ps1
if (-not (Test-Path "package.json") -or -not (Select-String -Path "package.json" -Pattern '"name": "trackrecord_"' -Quiet)) {
  Write-Host "Run this from the trackrecord_ folder." -ForegroundColor Red; exit 1
}

New-Item -ItemType Directory -Force -Path "app/api/session", "app/login/finish", "app/pending", "app/no-access", "components/auth" | Out-Null

Set-Content -LiteralPath "lib/auth/roles.ts" -Encoding utf8 -Value @'
/** The six TrackRecord roles. Stored as Firebase custom claims (set only by the server). */
export const ROLES = ["athlete", "coach", "official", "doctor", "admin", "tribunal"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  athlete: "Athlete",
  coach: "Coach",
  official: "Venue official",
  doctor: "Doctor",
  admin: "Federation admin",
  tribunal: "Tribunal",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Where each role lands after signing in. No role yet -> waiting page. */
export function homeFor(role: Role | null): string {
  return role ? `/${role}` : "/pending";
}
'@

Set-Content -LiteralPath "lib/auth/redirect.ts" -Encoding utf8 -Value @'
/**
 * Only allow redirects to paths on this site. Stops "open redirect" attacks,
 * where a link like /login?next=https://evil.example sends a freshly
 * signed-in user to an attacker's page.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null; // must be a path on this site
  if (next.startsWith("//") || next.startsWith("/\\")) return null; // protocol-relative tricks
  if (/[\u0000-\u001f]/.test(next)) return null; // control characters
  return next;
}
'@

Set-Content -LiteralPath "lib/auth/redirect.test.ts" -Encoding utf8 -Value @'
import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";
import { homeFor, isRole } from "./roles";

describe("safeNext (open redirect protection)", () => {
  it("allows paths on this site", () => {
    expect(safeNext("/athlete")).toBe("/athlete");
    expect(safeNext("/verify/42?x=1")).toBe("/verify/42?x=1");
  });
  it("blocks other sites and tricks", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/\u0000x"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it("handles empty values", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});

describe("roles", () => {
  it("recognises only the six roles", () => {
    expect(isRole("coach")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
  it("sends users without a role to the waiting page", () => {
    expect(homeFor("athlete")).toBe("/athlete");
    expect(homeFor(null)).toBe("/pending");
  });
});
'@

Set-Content -LiteralPath "lib/auth/session.ts" -Encoding utf8 -Value @'
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
'@

Set-Content -LiteralPath "lib/auth/client.ts" -Encoding utf8 -Value @'
"use client";

import {
  GoogleAuthProvider,
  inMemoryPersistence,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";

const EMAIL_KEY = "trackrecord.emailForSignIn";

/** Keep Firebase's own login only in memory: the server cookie is the real session. */
async function prepare() {
  const auth = clientAuth();
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

/** Sends the athlete a one-time sign-in link. */
export async function sendEmailLink(email: string, next: string | null) {
  const auth = await prepare();
  const url = new URL("/login/finish", window.location.origin);
  if (next) url.searchParams.set("next", next);
  await sendSignInLinkToEmail(auth, email, { url: url.toString(), handleCodeInApp: true });
  try {
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // storage blocked: the finish page will ask for the email again
  }
}

export function isEmailLink(href: string) {
  return isSignInWithEmailLink(clientAuth(), href);
}

export function rememberedEmail(): string | null {
  try {
    return window.localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function finishEmailLink(email: string, href: string): Promise<string> {
  const auth = await prepare();
  const cred = await signInWithEmailLink(auth, email, href);
  try {
    window.localStorage.removeItem(EMAIL_KEY);
  } catch {}
  return startSession(cred.user);
}

export async function signInWithGoogle(): Promise<string> {
  const auth = await prepare();
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return startSession(cred.user);
}

/** Swaps the fresh ID token for the server's httpOnly cookie, then drops the browser copy. */
async function startSession(user: User): Promise<string> {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  await signOut(clientAuth());
  if (!res.ok) throw new Error("Could not start your session. Please try again.");
  const data = (await res.json()) as { home: string };
  return data.home;
}

export async function signOutEverywhere() {
  await fetch("/api/session", { method: "DELETE" });
  await signOut(clientAuth()).catch(() => {});
}
'@

Set-Content -LiteralPath "app/api/session/route.ts" -Encoding utf8 -Value @'
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
'@

Set-Content -LiteralPath "app/login/page.tsx" -Encoding utf8 -Value @'
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in to TrackRecord</h1>
        <p className="text-muted-foreground">
          No password needed. We email you a one-time link, or you can use your Google account.
        </p>
      </header>
      <Suspense fallback={<p>Loading...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
'@

Set-Content -LiteralPath "app/login/finish/page.tsx" -Encoding utf8 -Value @'
import { Suspense } from "react";
import { FinishSignIn } from "@/components/auth/finish-sign-in";

export const metadata = { title: "Finishing sign-in" };

export default function FinishPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Finishing sign-in</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <FinishSignIn />
      </Suspense>
    </main>
  );
}
'@

Set-Content -LiteralPath "components/auth/login-form.tsx" -Encoding utf8 -Value @'
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/auth/redirect";
import { sendEmailLink, signInWithGoogle } from "@/lib/auth/client";

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await sendEmailLink(email.trim(), next);
      setStatus("sent");
      setMessage(`Check ${email.trim()} for your sign-in link. It works once.`);
    } catch {
      setStatus("error");
      setMessage("We couldn't send the link. Check the email address and try again.");
    }
  }

  async function onGoogle() {
    setStatus("sending");
    try {
      const home = await signInWithGoogle();
      router.replace(next ?? home);
    } catch {
      setStatus("error");
      setMessage("Google sign-in didn't finish. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onEmail} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="h-11 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="h-11 w-full text-base" disabled={status === "sending"}>
          Email me a sign-in link
        </Button>
      </form>

      <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="h-11 w-full text-base" onClick={onGoogle} disabled={status === "sending"}>
        Continue with Google
      </Button>

      <p role="status" aria-live="polite" className={status === "error" ? "text-destructive" : "text-foreground"}>
        {message}
      </p>
    </div>
  );
}
'@

Set-Content -LiteralPath "components/auth/finish-sign-in.tsx" -Encoding utf8 -Value @'
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/auth/redirect";
import { finishEmailLink, isEmailLink, rememberedEmail } from "@/lib/auth/client";

export function FinishSignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  async function complete(address: string) {
    try {
      const home = await finishEmailLink(address, window.location.href);
      router.replace(next ?? home);
    } catch {
      setError("This link has expired or was already used. Request a new one.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      await Promise.resolve(); // run after the first render
      if (!isEmailLink(window.location.href)) {
        setError("This isn't a valid sign-in link.");
        return;
      }
      const saved = rememberedEmail();
      if (saved) await complete(saved);
      else setNeedEmail(true); // opened on a different device: confirm the address
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">{error}</p>
        <Link href="/login" className="underline underline-offset-4">Back to sign in</Link>
      </div>
    );
  }

  if (needEmail) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void complete(email.trim());
        }}
      >
        <p>For your security, confirm the email address this link was sent to.</p>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required className="h-11 text-base" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" className="h-11 w-full text-base">Continue</Button>
      </form>
    );
  }

  return <p role="status">Signing you in...</p>;
}
'@

Set-Content -LiteralPath "components/auth/sign-out-button.tsx" -Encoding utf8 -Value @'
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOutEverywhere } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await signOutEverywhere();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
'@

Set-Content -LiteralPath "components/role-shell.tsx" -Encoding utf8 -Value @'
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Shared frame for every role area, and the role guard.
 * Every page under app/(athlete), app/(coach), ... passes through here.
 * IMPORTANT: each page must ALSO call requireRole() itself (see any role page),
 * because Next.js prerenders a page's static parts separately from this layout.
 */
export function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <Suspense fallback={<p role="status">Checking your access...</p>}>
        <Guard role={role}>{children}</Guard>
      </Suspense>
    </div>
  );
}

async function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const session = await requireRole(role);

  return (
    <>
      <nav aria-label="Area" className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <Link href="/" className="font-semibold">TrackRecord</Link>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-muted px-3 py-1 text-sm">{ROLE_LABELS[role]}</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">{session.email}</span>
          <SignOutButton />
        </div>
      </nav>
      {children}
    </>
  );
}
'@

Set-Content -LiteralPath "app/pending/page.tsx" -Encoding utf8 -Value @'
import Link from "next/link";

export const metadata = { title: "Waiting for access" };

export default function Pending() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12">
      <h1 className="text-2xl font-semibold">You&apos;re signed in</h1>
      <p>Your account doesn&apos;t have a role yet. The federation admin gives each person their role.</p>
      <p>Once they have, sign out and sign in again to open your area.</p>
      <Link href="/login" className="underline underline-offset-4">Back to sign in</Link>
    </main>
  );
}
'@

Set-Content -LiteralPath "app/no-access/page.tsx" -Encoding utf8 -Value @'
import Link from "next/link";

export const metadata = { title: "No access" };

export default function NoAccess() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-12">
      <h1 className="text-2xl font-semibold">This area isn&apos;t for your role</h1>
      <p>Each person can only open the area for their own role. This attempt was blocked.</p>
      <Link href="/" className="underline underline-offset-4">Go to the start page</Link>
    </main>
  );
}
'@

Set-Content -LiteralPath "app/page.tsx" -Encoding utf8 -Value @'
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { ROLE_LABELS, homeFor } from "@/lib/auth/roles";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">TrackRecord</h1>
        <p className="text-lg text-muted-foreground">
          Tamper-evident performance records for Kenyan para-athletes. Nothing in TrackRecord can be changed silently.
        </p>
      </header>
      <Suspense fallback={<p>Loading...</p>}>
        <SignedInState />
      </Suspense>
      <p>
        <Link href="/verify/1" className="underline underline-offset-4">Verify a certificate</Link> (no account needed)
      </p>
    </main>
  );
}

async function SignedInState() {
  const session = await getSession();
  if (!session) {
    return (
      <Button asChild className="h-11 px-6 text-base">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="space-y-3">
      <p>
        Signed in as <strong>{session.email}</strong>
        {session.role ? ` (${ROLE_LABELS[session.role]})` : ""}.
      </p>
      <Button asChild className="h-11 px-6 text-base">
        <Link href={homeFor(session.role)}>Open my area</Link>
      </Button>
    </div>
  );
}
'@

Set-Content -LiteralPath "scripts/set-role.mjs" -Encoding utf8 -Value @'
// Gives a user a TrackRecord role (a Firebase custom claim). Admin-only tool.
//
// Local emulators:  node --env-file=.env.local scripts/set-role.mjs someone@example.com admin
// Real Firebase:    node --env-file=.env.local scripts/set-role.mjs someone@example.com admin --prod
//
// The user must sign out and in again for a new role to take effect.
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const ROLES = ["athlete", "coach", "official", "doctor", "admin", "tribunal", "none"];
const [email, role] = process.argv.slice(2);
const prod = process.argv.includes("--prod");

if (!email || !ROLES.includes(role)) {
  console.error(`Usage: node --env-file=.env.local scripts/set-role.mjs <email> <${ROLES.join("|")}> [--prod]`);
  process.exit(1);
}
if (prod) {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
console.log(`Target: ${prod ? "REAL Firebase project" : "local emulators"}`);

const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
initializeApp({ credential: cert(sa) });

const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No user with email ${email}. They must sign in once first.`);
  process.exit(1);
}
const claims = role === "none" ? {} : { role };
await getAuth().setCustomUserClaims(user.uid, claims);
await getAuth().revokeRefreshTokens(user.uid); // old sessions end; the next sign-in carries the new role
await getFirestore()
  .collection("auditLog")
  .add({ action: "role.set", target: user.uid, email, role, by: "set-role script", at: new Date().toISOString() });
console.log(`Done: ${email} is now "${role}". They must sign in again.`);
'@

$roles = [ordered]@{ athlete = "Athlete"; coach = "Coach"; official = "Venue official"; doctor = "Doctor"; admin = "Federation admin"; tribunal = "Tribunal" }
foreach ($r in $roles.Keys) {
$label = $roles[$r]
Set-Content -LiteralPath "app/($r)/$r/page.tsx" -Encoding utf8 -Value @"
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";

export const metadata = { title: "$label" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("$r"); // every role page checks for itself, not just the layout
  return <h1 className="text-2xl font-semibold">$label area</h1>;
}
"@
}

Write-Host "Phase 1A files written:" -ForegroundColor Green
git status --short
