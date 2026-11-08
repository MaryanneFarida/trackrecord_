"use client";

import { useEffect } from "react";

/** Registers /sw.js in production only (in development it would fight hot reload). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      // In development, remove any service worker left over from testing a production build.
      navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
