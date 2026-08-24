// Minimal service worker: satisfies installability, and handles push events
// so the morning brief (and anything else via lib/webPush.ts) shows up as a
// real phone notification when the app is installed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = { title: "LS Growth", body: "", url: "/dashboard/today" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Ignore malformed payloads rather than throwing inside the push handler.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard/today";
  event.waitUntil(self.clients.openWindow(url));
});
