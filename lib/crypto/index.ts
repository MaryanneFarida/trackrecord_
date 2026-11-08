/**
 * lib/crypto
 * - files.ts: AES-256-GCM encryption of ID photos and selfies (and later medical reports).
 * - Phase 5 adds per-event check-in code secrets: HMAC-SHA256(TOTP_MASTER_SECRET, athleteId + eventId).
 */
export { seal, open, type Sealed } from "./files";
