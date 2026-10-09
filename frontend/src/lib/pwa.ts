import { useEffect, useState, useSyncExternalStore } from "react";
import { apiGet, apiPost } from "./api";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function registerServiceWorker() {
  // In dev the worker only handles push/notifications (no caching, so hot reload keeps working).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register(import.meta.env.PROD ? "/sw.js" : "/sw.js?dev=1").then(() => syncPushSubscription()).catch(() => undefined));
  }
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

// ---------- install prompt (captured once at startup so any component can use it later) ----------
let deferred: BIPEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; emit(); });
  window.addEventListener("appinstalled", () => { installed = true; deferred = null; emit(); });
}
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** True when the talksme.in PWA is installed on this device (Chrome/Android via getInstalledRelatedApps). */
export async function appInstalled(): Promise<boolean> {
  if (installed || isStandalone()) return true;
  const nav = navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> };
  try { return !!nav.getInstalledRelatedApps && (await nav.getInstalledRelatedApps()).length > 0; } catch { return false; }
}

export function useInstallPrompt() {
  const snap = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => `${!!deferred}-${installed}`);
  void snap;
  return {
    canInstall: !!deferred,
    installed: installed || isStandalone(),
    prompt: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const r = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
      deferred = null; emit();
      return r.outcome === "accepted";
    },
  };
}

// ---------- notifications + Web Push ----------
export const notifSupported = () => typeof window !== "undefined" && "Notification" in window;
const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Subscribe this device for server push (works when the app is closed on Android/desktop; iOS needs the installed app). */
export async function syncPushSubscription(): Promise<boolean> {
  if (!notifSupported() || Notification.permission !== "granted" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { public_key } = await apiGet<{ public_key: string }>("/push/key");
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(public_key) });
    }
    const j = sub.toJSON();
    await apiPost("/push/subscribe", { endpoint: j.endpoint, keys: j.keys });
    return true;
  } catch { return false; }
}

const permSubs = new Set<() => void>();
export function useNotificationPermission() {
  const perm = useSyncExternalStore((f) => { permSubs.add(f); return () => permSubs.delete(f); }, () => (notifSupported() ? Notification.permission : "unsupported"));
  return perm as NotificationPermission | "unsupported";
}
export async function enableNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (!notifSupported()) return "unsupported";
  const p = await Notification.requestPermission();
  permSubs.forEach((f) => f());
  if (p === "granted") await syncPushSubscription();
  return p;
}

/** Show a system notification (through the service worker when available so it works on Android). Same tag replaces older ones. */
export async function showLocalNotification(title: string, body: string, url: string, tag: string, call = false) {
  if (!notifSupported() || Notification.permission !== "granted") return;
  const opts = { body, icon: "/apple-touch-icon.png", badge: "/favicon-32x32.png", tag, data: url, renotify: true, requireInteraction: call, vibrate: call ? [400, 200, 400, 200, 400] : [150] } as NotificationOptions;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* notifications unavailable */ }
}
