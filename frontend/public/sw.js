// talksme.in PWA service worker: app-shell cache + offline fallback. API calls are never cached.
const CACHE = "talksme-shell-v2";
const DEV = new URL(self.location.href).searchParams.has("dev");
const SHELL = ["/", "/chat", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  if (DEV) { self.skipWaiting(); return; }
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (DEV || e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/chat").then((r) => r || caches.match("/"))));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && url.origin === self.location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});

// Web Push from the server: new messages + incoming calls, delivered even when the app is closed (best effort, OS-dependent).
self.addEventListener("push", (e) => {
  let d = { title: "talksme.in", body: "You have a new message", url: "/chat", tag: "talksme" };
  try { d = { ...d, ...e.data.json() }; } catch (_) { /* plain push */ }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: "/apple-touch-icon.png", badge: "/favicon-32x32.png", tag: d.tag, renotify: true, data: d.url,
    requireInteraction: !!d.call, vibrate: d.call ? [500, 250, 500, 250, 500, 250, 500] : [150, 80, 150],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data || "/chat", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) return same.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
