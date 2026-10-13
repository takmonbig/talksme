import { Fragment } from "react";

// http(s) URLs, www. links and bare domains (lala.com, xyz.invivo.cc/path). Emails and file names are skipped.
// Trailing punctuation like ")." or "," stays outside the link.
const URL_RE = /(?:https?:\/\/[^\s<>"']+|(?<![@\w.-])(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?![\w@-])(?::\d{2,5})?(?:[/?#][^\s<>"']*)?)/gi;
const FILE_EXT = /\.(jpe?g|png|gif|webp|pdf|txt|docx?|xlsx?|csv|mp3|mp4|mov|zip|rar|exe|apk)$/i;
const TRAIL = /[).,!?;:'"\]]+$/;

/** Safe http(s) href or null. Never javascript:/data:, and no HTML injection (React escapes the text). */
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
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
    const bare = !/^https?:\/\//i.test(url);
    const href = bare && FILE_EXT.test(url.split(/[/?#]/)[0]) ? null : safeHref(url);
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
