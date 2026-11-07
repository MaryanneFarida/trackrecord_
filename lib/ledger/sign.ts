import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

/** System signatures (Ed25519). Private key: server env only. Public key: published. */
export const loadPrivateKey = (pem: string): KeyObject => createPrivateKey(pem);
export const loadPublicKey = (pem: string): KeyObject => createPublicKey(pem);

export function signHash(hashHex: string, privateKey: KeyObject): string {
  return sign(null, Buffer.from(hashHex, "hex"), privateKey).toString("base64");
}

export function verifyHash(hashHex: string, signatureB64: string, publicKey: KeyObject): boolean {
  try {
    return verify(null, Buffer.from(hashHex, "hex"), publicKey, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
