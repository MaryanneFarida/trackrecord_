"use client";

import { useOffline } from "next/offline";

/** Plain-language banner, announced to screen readers, when the network drops. */
export function ConnectivityBanner() {
  const offline = useOffline();
  return (
    <div role="status" aria-live="polite">
      {offline ? (
        <p className="bg-amber-100 px-4 py-2 text-center text-amber-950">
          You are offline. Anything you sign is saved on this phone and will upload when you are back online.
        </p>
      ) : null}
    </div>
  );
}
