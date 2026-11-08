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
