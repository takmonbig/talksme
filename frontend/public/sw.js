// talksme.in PWA service worker: app-shell cache + offline fallback. API calls are never cached.
const CACHE = "talksme-shell-v3";
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
  const opts = {
    body: d.body, icon: "/apple-touch-icon.png", badge: "/favicon-32x32.png", tag: d.tag, renotify: true, data: d.url,
    timestamp: Date.now(), silent: false,
    requireInteraction: !!d.call,
    // long ring-like vibration for calls (re-sent every few seconds by the server while ringing)
    vibrate: d.call ? [800, 300, 800, 300, 800, 300, 800, 300, 800] : [200, 100, 200],
    actions: d.call ? [{ action: "answer", title: "📞 Answer" }, { action: "decline", title: "Decline" }] : [{ action: "open", title: "Reply" }],
  };
  e.waitUntil((async () => {
    // tell open tabs too (they play the ringtone / sound themselves)
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    list.forEach((c) => c.postMessage({ type: "push", data: d }));
    await self.registration.showNotification(d.title, opts);
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "decline") return; // caller sees "no answer" after the ring timeout
  const url = new URL(e.notification.data || "/chat", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) return same.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});

// Browser rotated/expired the push subscription: renew it and re-register with the backend (cookie auth).
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const { public_key } = await (await fetch("/api/push/key")).json();
    const pad = "=".repeat((4 - (public_key.length % 4)) % 4);
    const raw = atob((public_key + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    const j = sub.toJSON();
    await fetch("/api/push/subscribe", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
  })().catch(() => undefined));
});
