/** Real Meta (Facebook) Pixel: loads fbevents.js once, inits each Pixel ID once, and de-duplicates events per page view. */
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

const inited = new Set<string>();
const fired = new Set<string>();

/** Accepts a bare ID or the whole Meta Pixel code an admin pasted; returns the numeric Pixel ID ("" if none). */
export function extractPixelId(raw: string): string {
  const v = raw.trim();
  if (/^\d*$/.test(v)) return v.slice(0, 20);
  const m = v.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,20})/) ?? v.match(/[?&]id=(\d{6,20})/) ?? v.match(/\b(\d{15,16})\b/);
  return m ? m[1] : "";
}

function ensureScript() {
  if (window.fbq) return;
  // Official Meta base code, unrolled.
  const n = function (...args: unknown[]) { if (n.callMethod) n.callMethod(...args); else n.queue.push(args); } as Fbq;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  window.fbq = n; window._fbq = n;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
}

export function initPixel(id: string) {
  if (!/^\d{6,20}$/.test(id)) return false;
  ensureScript();
  if (!inited.has(id)) { window.fbq!("init", id); inited.add(id); }
  return true;
}

/** Fire a standard event once per page load. eventID lets Meta de-duplicate with a future Conversions API. */
export function trackPixel(id: string, event: "PageView" | "Lead" | "Contact" | string, params?: Record<string, string | number>) {
  const key = `${id}:${event}:${location.pathname}`; // once per page; client-side navigation to another page tracks again
  if (!initPixel(id) || fired.has(key)) return;
  fired.add(key);
  const eventID = `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const standard = ["PageView", "Lead", "Contact", "CompleteRegistration", "ViewContent"].includes(event);
  window.fbq!(standard ? "trackSingle" : "trackSingleCustom", id, event, params ?? {}, { eventID });
}

/** UTM/campaign info for event params (never phone numbers or chat content). */
export function campaignParams(search: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    const v = search.get(k);
    if (v) out[k] = v.slice(0, 100);
  }
  return out;
}

/** Admin Pixel Test: fire an event without de-duplication and report whether Meta's endpoint received it. */
export async function testPixel(id: string, event: string): Promise<{ script: boolean; sent: boolean }> {
  if (!initPixel(id)) return { script: false, sent: false };
  const before = performance.getEntriesByType("resource").filter((e) => e.name.includes("facebook.com/tr")).length;
  window.fbq!("trackSingle", id, event, { test: "talksme_pixel_test" }, { eventID: `test-${Date.now()}` });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const script = !!document.querySelector('script[src*="connect.facebook.net"]') && typeof (window.fbq as unknown as { getState?: unknown })?.getState !== "undefined";
    const sent = performance.getEntriesByType("resource").filter((e) => e.name.includes("facebook.com/tr")).length > before;
    if (sent) return { script: true, sent };
    if (i === 19) return { script, sent };
  }
  return { script: false, sent: false };
}
