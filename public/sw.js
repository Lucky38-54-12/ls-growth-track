// Minimal pass-through service worker — its only job is to satisfy the
// browser's installability requirement so "Add to Home Screen" shows up.
// No caching: every request just goes straight to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
