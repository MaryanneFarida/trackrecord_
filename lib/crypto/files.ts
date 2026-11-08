import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption for sensitive files (ID photos, selfies, later medical reports).
 * AES-256-GCM: confidential AND tamper-evident; a changed byte makes
 * decryption fail instead of returning altered data.
 * The key is derived from FILE_ENCRYPTION_KEY just for files (HKDF), and the
 * record it belongs to is bound in as "associated data", so an encrypted
 * photo can't be copied onto another athlete's record.
 */
export interface Sealed {
  v: 1;
  iv: Buffer; // 12 random bytes, new for every file
  tag: Buffer; // 16-byte authentication tag
  data: Buffer; // ciphertext
}

function fileKey(masterHex: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(masterHex, "hex"), Buffer.alloc(0), "trackrecord/files/v1", 32));
}

export function seal(plain: Buffer, masterHex: string, boundTo: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fileKey(masterHex), iv);
  cipher.setAAD(Buffer.from(boundTo, "utf8"));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { v: 1, iv, tag: cipher.getAuthTag(), data };
}

export function open(sealed: { iv: Uint8Array; tag: Uint8Array; data: Uint8Array }, masterHex: string, boundTo: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", fileKey(masterHex), Buffer.from(sealed.iv));
  decipher.setAAD(Buffer.from(boundTo, "utf8"));
  decipher.setAuthTag(Buffer.from(sealed.tag));
  return Buffer.concat([decipher.update(Buffer.from(sealed.data)), decipher.final()]);
}
