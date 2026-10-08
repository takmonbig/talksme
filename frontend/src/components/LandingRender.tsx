import { useEffect, useState } from "react";
import { Clock, Lock, MessageCircle, ShieldCheck, Sparkles, BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/common";
import type { LandingPageInput, PublicEmployee } from "@/lib/types";
import { cn } from "@/lib/utils";

const FONT_STACK: Record<string, string> = {
  Inter: "'Inter Variable', sans-serif", "Plus Jakarta Sans": "'Plus Jakarta Sans Variable', sans-serif",
  "JetBrains Mono": "'JetBrains Mono Variable', monospace",
};
export const LP_FONTS = Object.keys(FONT_STACK);

/** Renders Template A (image selection) or B (direct chat). Shared by public pages and the builder preview. */
export function LandingRender({ page, orgName, employees, onChat, mobile }: {
  page: LandingPageInput; orgName: string; employees: PublicEmployee[]; onChat: (employeeId?: string, imageId?: string) => void; mobile?: boolean;
}) {
  const [slide, setSlide] = useState(0);
  const slides = [page.banner_url, ...page.images.map((i) => i.url)].filter(Boolean);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);
  const c = page.primary_color;
  const font = FONT_STACK[page.font] ?? FONT_STACK.Inter;
  const empById = Object.fromEntries(employees.map((e) => [e.id, e]));
  const logo = page.logo_url ? <img src={page.logo_url} alt={orgName} className={cn("object-contain", page.template === "B" ? "h-24 w-24" : "h-12 w-12")} /> :
    <div className={cn("flex items-center justify-center rounded-2xl font-bold text-white", page.template === "B" ? "h-24 w-24 text-3xl" : "h-12 w-12 text-lg")} style={{ background: c }}>{orgName.slice(0, 2).toUpperCase()}</div>;
  const trust = (
    <div className={cn("grid gap-3", mobile ? "grid-cols-1" : "sm:grid-cols-3")}>
      {page.trust_items.map((t, i) => {
        const Icon = [ShieldCheck, Lock, Sparkles][i % 3];
        return (
          <div key={i} className="flex items-center gap-3 rounded-2xl border bg-white/80 p-4 text-left text-slate-800 shadow-sm backdrop-blur" data-testid="lp-trust-item">
            <div className="rounded-xl p-2 text-white" style={{ background: c }}><Icon className="h-4 w-4" /></div><span className="text-sm font-medium">{t}</span>
          </div>
        );
      })}
    </div>
  );
  const cta = (
    <button onClick={() => onChat()} data-testid="lp-chat-now-button"
      className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-semibold text-white shadow-lg transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style={{ background: `linear-gradient(135deg, ${c}, #8B5CF6)` }}>
      <MessageCircle className="h-5 w-5" /> {page.cta_text}
    </button>
  );
  const availability = page.available_24_7 && (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700" data-testid="lp-247-indicator">
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Available 24/7
    </span>
  );

  if (page.template === "B") {
    return (
      <div className="min-h-full bg-slate-50 text-slate-900" style={{ fontFamily: font }} data-testid="lp-template-b">
        <div className="relative overflow-hidden px-5 pb-10 pt-12 text-center" style={{ background: `radial-gradient(1200px 400px at 50% -10%, ${c}33, transparent)` }}>
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
            {logo}
            <p className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: c }}>{orgName}</p>
            <h1 className={cn("font-bold tracking-tight", mobile ? "text-3xl" : "text-4xl sm:text-5xl")} data-testid="lp-title">{page.title}</h1>
            <p className="text-base text-slate-600">{page.description}</p>
            {availability}
            <div className="mt-2 w-full">{cta}</div>
            <p className="flex items-center gap-1 text-xs text-slate-500"><Lock className="h-3 w-3" /> Your number is only used to continue this conversation.</p>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-5 pb-12">{trust}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-900" style={{ fontFamily: font }} data-testid="lp-template-a">
      <header className="flex items-center gap-3 px-5 py-4">{logo}<span className="font-semibold">{orgName}</span><span className="ml-auto">{availability}</span></header>
      <div className="relative mx-5 h-56 overflow-hidden rounded-3xl sm:h-72">
        {slides.map((s, i) => <img key={s + i} src={s} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-700", i === slide ? "opacity-100" : "opacity-0")} />)}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
        <div className="absolute bottom-0 p-5 text-white">
          <h1 className={cn("font-bold tracking-tight", mobile ? "text-2xl" : "text-3xl sm:text-4xl")} data-testid="lp-title">{page.title}</h1>
          <p className="mt-1 text-sm text-white/85">{page.description}</p>
        </div>
        <div className="absolute bottom-3 right-4 flex gap-1">{slides.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full bg-white transition-[width] duration-300", i === slide ? "w-5" : "w-1.5 opacity-60")} />)}</div>
      </div>
      <div className="px-5 py-6">
        <p className="mb-3 text-sm font-semibold text-slate-600">Choose who you'd like to talk to</p>
        <div className={cn("grid gap-3", mobile ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
          {page.images.map((img) => {
            const e = img.employee_id ? empById[img.employee_id] : undefined;
            return (
              <button key={img.id} onClick={() => onChat(img.employee_id ?? undefined, img.id)} data-testid="lp-associate-card"
                className="group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg">
                <div className="relative aspect-square overflow-hidden"><img src={img.url} alt={img.label} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  {e && <span className={cn("absolute right-2 top-2 h-3 w-3 rounded-full border-2 border-white", e.status === "online" ? "bg-emerald-500" : "bg-slate-400")} />}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold">{img.label}</p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">{e?.verified && <BadgeCheck className="h-3 w-3" style={{ color: c }} />}{e?.title ?? "Team"}</p>
                </div>
              </button>
            );
          })}
          {page.images.length === 0 && employees.slice(0, 4).map((e) => (
            <button key={e.id} onClick={() => onChat(e.id)} className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm" data-testid="lp-associate-card"><Avatar name={e.name} src={e.avatar} size={56} /><span className="text-sm font-semibold">{e.name}</span></button>
          ))}
        </div>
      </div>
      <div className="space-y-5 px-5 pb-10">
        {trust}
        <div className="flex items-start gap-2 rounded-2xl bg-slate-900 p-4 text-sm text-slate-200"><Clock className="mt-0.5 h-4 w-4 shrink-0" />Chats are private between you and {orgName}. We never ask for passwords or card PINs in chat.</div>
        {cta}
      </div>
    </div>
  );
}
