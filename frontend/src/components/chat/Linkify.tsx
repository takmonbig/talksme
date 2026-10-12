import { Fragment } from "react";

// http(s) URLs and bare www. links. Trailing punctuation like ")." or "," stays outside the link.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAIL = /[).,!?;:'"\]]+$/;

/** Safe http(s) href or null. Never javascript:/data:, and no HTML injection (React escapes the text). */
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw.startsWith("www.") ? `https://${raw}` : raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

export function Linkify({ text, className }: { text: string; className?: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(TRAIL)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    const href = safeHref(url);
    const start = m.index ?? 0;
    out.push(text.slice(last, start));
    out.push(href
      ? <a key={start} href={href} target="_blank" rel="noopener noreferrer nofollow" className={className ?? "break-all font-medium text-sky-600 underline underline-offset-2 hover:text-sky-700 dark:text-sky-400"} data-testid="chat-link" onClick={(e) => e.stopPropagation()}>{url}</a>
      : url);
    out.push(trail);
    last = start + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>;
}
