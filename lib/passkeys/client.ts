"use client";

import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PasskeyError(data.error ?? "failed");
  return data as T;
}

export class PasskeyError extends Error {}

/** Plain-language messages for each failure. */
export function explain(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  if (err instanceof Error && err.name === "NotAllowedError") return "The request was cancelled or timed out. Try again.";
  if (err instanceof Error && err.name === "InvalidStateError") return "This phone already has a TrackRecord passkey.";
  const messages: Record<string, string> = {
    sign_in_again: "For your security, sign in again before adding a passkey.",
    challenge_expired: "That took too long. Please try again.",
    not_verified: "The passkey couldn't be verified. Please try again.",
    bad_signature: "The signature didn't check out. Nothing was approved.",
    unknown_passkey: "That passkey isn't registered to your account.",
    no_passkey: "You don't have a passkey yet.",
  };
  return messages[code] ?? "Something went wrong. Please try again.";
}

export function passkeysSupported() {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/** Creates a passkey on this phone, locked by its fingerprint, face or PIN. */
export async function registerPasskey(label: string) {
  WebAuthnAbortService.cancelCeremony();
  const { options } = await post<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>(
    "/api/passkeys/register/options",
    {},
  );
  const response = await startRegistration({ optionsJSON: options });
  await post("/api/passkeys/register/verify", { response, label });
}

/** Signs with the passkey. Pass actionHash to approve one specific action. */
export async function verifyWithPasskey(actionHash: string | null = null) {
  WebAuthnAbortService.cancelCeremony();
  const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
    "/api/passkeys/authenticate/options",
    { actionHash },
  );
  const response = await startAuthentication({ optionsJSON: options });
  return post<{ ok: true; passkeyId: string; actionHash: string | null }>("/api/passkeys/authenticate/verify", { response });
}

/** A readable default name, e.g. "Android phone" or "Windows computer". */
export function defaultLabel() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/Mac/i.test(ua)) return "Mac";
  return "This device";
}
