import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

/** Same JSON -> same bytes, every time (RFC 8785). Without this, hashes would not be reliable. */
export function canonical(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("Value cannot be canonicalized");
  return out;
}

/** SHA-256 of the canonical form, as hex. */
export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
