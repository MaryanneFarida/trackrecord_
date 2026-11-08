/**
 * The "relying party" (RP) is this website. A passkey is bound to the exact
 * site that created it, which is why passkeys can't be phished: a fake site
 * on another domain simply cannot use them.
 */
export const RP_NAME = "TrackRecord";

export interface RelyingParty {
  rpID: string; // hostname, e.g. trackrecord-tau.vercel.app or localhost
  origin: string; // e.g. https://trackrecord-tau.vercel.app
}

/** Works out the RP from the request, and refuses requests from other sites. */
export function relyingPartyFrom(req: Request): RelyingParty | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.host !== host) return null; // cross-site request
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) return null; // passkeys need HTTPS outside localhost
  return { rpID: url.hostname, origin: url.origin };
}
