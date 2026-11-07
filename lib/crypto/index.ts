/**
 * lib/crypto (Phases 1, 5, 7)
 * - AES-GCM encryption of ID photos, medical reports and watch evidence (FILE_ENCRYPTION_KEY).
 * - Per-event check-in code secrets: HMAC-SHA256(TOTP_MASTER_SECRET, athleteId + eventId).
 */
export {};
