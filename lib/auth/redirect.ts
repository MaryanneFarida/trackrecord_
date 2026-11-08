/**
 * Only allow redirects to paths on this site. Stops "open redirect" attacks,
 * where a link like /login?next=https://evil.example sends a freshly
 * signed-in user to an attacker's page.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null; // must be a path on this site
  if (next.startsWith("//") || next.startsWith("/\\")) return null; // protocol-relative tricks
  if (/[\u0000-\u001f]/.test(next)) return null; // control characters
  return next;
}
