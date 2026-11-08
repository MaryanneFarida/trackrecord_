import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * The check-in code on the athlete's phone: a 6-digit TOTP (RFC 6238) that
 * changes every 30 seconds, so a screenshot or a shared photo of the QR is
 * useless half a minute later. Each athlete gets a different secret for each
 * event, derived from TOTP_MASTER_SECRET, so the database stores no secrets.
 */
export const STEP_SECONDS = 30;
export const DIGITS = 6;

/** Per-athlete, per-event secret. Never sent to any browser. */
export function athleteSecret(master: string, eventId: string, uid: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(master, "utf8"), Buffer.from(eventId, "utf8"), `trackrecord/checkin/v1/${uid}`, 20));
}

/** RFC 4226 HOTP with HMAC-SHA1 (what RFC 6238 TOTP is built on). */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const stepAt = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS);

export function currentCode(secret: Buffer, nowMs: number) {
  const step = stepAt(nowMs);
  return { code: hotp(secret, step), expiresAt: new Date((step + 1) * STEP_SECONDS * 1000).toISOString() };
}

/** Accepts the current code or the one just before it (allows for a slow scan or a slightly wrong clock). */
export function verifyCode(secret: Buffer, code: string, nowMs: number): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const step = stepAt(nowMs);
  return [step, step - 1].some((s) => timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(code)));
}

/** What the QR holds: TR1.<eventId>.<athleteId>.<code>. No secret, no personal details. */
export function qrText(eventId: string, uid: string, code: string) {
  return `TR1.${eventId}.${uid}.${code}`;
}

export function parseQr(text: string): { eventId: string; athleteId: string; code: string } | null {
  const m = text.trim().match(/^TR1\.([A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{1,128})\.(\d{6})$/);
  return m ? { eventId: m[1], athleteId: m[2], code: m[3] } : null;
}

// ---------- Scan token ----------
// After a good scan the official has a few minutes to compare the face, but the
// code rotates every 30 s. So the server hands the official a short-lived,
// signed "this code was valid at this moment" token, which the decision must carry.

export const SCAN_TOKEN_TTL_MS = 3 * 60 * 1000;

function tokenKey(master: string) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(master, "utf8"), Buffer.alloc(0), "trackrecord/scan-token/v1", 32));
}

export function makeScanToken(master: string, t: { eventId: string; athleteId: string; officialId: string; at: number }) {
  const body = Buffer.from(JSON.stringify(t)).toString("base64url");
  const sig = createHmac("sha256", tokenKey(master)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openScanToken(master: string, token: string, expect: { eventId: string; athleteId: string; officialId: string }, nowMs: number) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const good = createHmac("sha256", tokenKey(master)).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return false;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return t.eventId === expect.eventId && t.athleteId === expect.athleteId && t.officialId === expect.officialId && nowMs - t.at <= SCAN_TOKEN_TTL_MS && nowMs >= t.at;
  } catch {
    return false;
  }
}
