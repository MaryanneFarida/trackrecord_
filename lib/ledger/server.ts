import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { loadPrivateKey, loadPublicKey } from "./sign";
import { appendRecord, verifyStoredChain, sealDay } from "./store";
import type { RecordType } from "./chain";

/** The system's signing key (from SIGNING_PRIVATE_KEY). Never leaves the server. */
export function systemSigner() {
  const env = serverEnv();
  return { keyId: env.SIGNING_KEY_ID, privateKey: loadPrivateKey(env.SIGNING_PRIVATE_KEY) };
}

/** All public keys that may have signed records. After a key rotation, older keys are added here. */
export function publicKeys() {
  const env = serverEnv();
  return { [env.SIGNING_KEY_ID]: loadPublicKey(env.SIGNING_PUBLIC_KEY) };
}

/** Use this in every phase that records something permanent. */
export const ledgerAppend = (type: RecordType, payload: Record<string, unknown>, also?: Parameters<typeof appendRecord>[4]) =>
  appendRecord(adminDb(), systemSigner(), type, payload, also);
export const ledgerVerify = () => verifyStoredChain(adminDb(), publicKeys());
export const ledgerSealDay = (day: string) => sealDay(adminDb(), day);
