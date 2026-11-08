"use client";

import canonicalize from "canonicalize";
import { startAuthentication, WebAuthnAbortService } from "@simplewebauthn/browser";
import { PasskeyError } from "./client";

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sends an important action (approve an athlete, create an invite, later: a
 * race time) signed with the user's passkey. The phone signs a hash of the
 * exact payload, and the server re-checks it, so nobody can change it in transit.
 */
export async function signedPost<T = unknown>(url: string, payload: Record<string, unknown>): Promise<T> {
  const text = canonicalize(payload);
  if (!text) throw new PasskeyError("bad_request");
  const actionHash = await sha256Hex(text);
  WebAuthnAbortService.cancelCeremony();
  const optRes = await fetch("/api/passkeys/authenticate/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionHash }),
  });
  const optData = await optRes.json().catch(() => ({}));
  if (!optRes.ok) throw new PasskeyError(optData.error ?? "failed");
  const assertion = await startAuthentication({ optionsJSON: optData.options });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PasskeyError(data.error ?? "failed");
  return data as T;
}
