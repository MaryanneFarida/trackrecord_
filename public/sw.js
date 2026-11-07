// TrackRecord service worker: keeps the app opening with no network, and receives push alerts.
// Bump VERSION whenever this file changes so phones drop old caches.
const VERSION = "v1";
const SHELL = `trackrecord-shell-${VERSION}`;
const RUNTIME = `trackrecord-runtime-${VERSION}`;
const PRECACHE = ["/", "/offline", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;               // never cache writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;    // Firebase has its own offline cache
  if (url.pathname.startsWith("/api/")) return;       // API answers must always be fresh

  // Pages: network first, then the last saved copy, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(request, copy)); return res; })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline"))),
    );
    return;
  }

  // Static files (scripts, styles, images, fonts): cache first.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(request, copy)); return res;
      })),
    );
  }
});

// Push alerts (objections, locked results, removals). Wired up in Phase 4.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "TrackRecord", body: "You have a new update." };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: "/icon-192.png", data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url));
});
