import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { ChallengeState } from "./challenge";
import { RP_NAME, type RelyingParty } from "./rp";
import type { PasskeyStore } from "./store";

/** The library base64url-encodes whatever it's given, so hand it the raw bytes of our challenge. */
const challengeBytes = (c: ChallengeState) => new Uint8Array(Buffer.from(c.challenge, "base64url"));

/**
 * The four passkey steps, independent of Next.js so they can be tested.
 * userVerification "required" means the phone must check the person
 * (fingerprint, face or PIN) every time, not just that a phone is present.
 */

export async function registrationOptions(args: {
  rp: RelyingParty;
  uid: string;
  userName: string;
  store: PasskeyStore;
  challenge: ChallengeState;
}) {
  const existing = await args.store.list(args.uid);
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: args.rp.rpID,
    userName: args.userName,
    userID: new TextEncoder().encode(args.uid),
    challenge: challengeBytes(args.challenge),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })), // no duplicates on one phone
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
}

export async function finishRegistration(args: {
  rp: RelyingParty;
  uid: string;
  response: RegistrationResponseJSON;
  challenge: ChallengeState;
  label: string;
  store: PasskeyStore;
  now: string;
}) {
  const result = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.challenge.challenge,
    expectedOrigin: args.rp.origin,
    expectedRPID: args.rp.rpID,
    requireUserVerification: true,
  });
  if (!result.verified) return { ok: false as const };
  const info = result.registrationInfo;
  await args.store.add(args.uid, {
    id: info.credential.id,
    publicKey: info.credential.publicKey,
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    label: args.label.slice(0, 60) || "Passkey",
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    createdAt: args.now,
    lastUsedAt: null,
  });
  return { ok: true as const, id: info.credential.id };
}

export async function authenticationOptions(args: {
  rp: RelyingParty;
  uid: string;
  store: PasskeyStore;
  challenge: ChallengeState;
}) {
  const passkeys = await args.store.list(args.uid);
  if (passkeys.length === 0) return null;
  return generateAuthenticationOptions({
    rpID: args.rp.rpID,
    challenge: challengeBytes(args.challenge),
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: "required",
  });
}

/** Verifies a signature. On success returns which passkey signed and the action it approved. */
export async function finishAuthentication(args: {
  rp: RelyingParty;
  uid: string;
  response: AuthenticationResponseJSON;
  challenge: ChallengeState;
  store: PasskeyStore;
  now: string;
}) {
  const passkey = (await args.store.list(args.uid)).find((p) => p.id === args.response.id);
  if (!passkey) return { ok: false as const, reason: "unknown_passkey" };
  const result = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.challenge.challenge,
    expectedOrigin: args.rp.origin,
    expectedRPID: args.rp.rpID,
    credential: { id: passkey.id, publicKey: passkey.publicKey, counter: passkey.counter, transports: passkey.transports },
    requireUserVerification: true,
  });
  if (!result.verified) return { ok: false as const, reason: "bad_signature" };
  await args.store.touch(args.uid, passkey.id, result.authenticationInfo.newCounter, args.now);
  return { ok: true as const, passkeyId: passkey.id, actionHash: args.challenge.actionHash };
}
