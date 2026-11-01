import { useEffect, useState } from "react";
import { Clock, Lock, MessageCircle, ShieldCheck, Sparkles, BadgeCheck } from "lucide-react";
import { Avatar, TalksMeVerified } from "@/components/common";
import type { LandingPageInput, PublicEmployee } from "@/lib/types";
import { cn } from "@/lib/utils";

const FONT_STACK: Record<string, string> = {
  Inter: "'Inter Variable', sans-serif", "Plus Jakarta Sans": "'Plus Jakarta Sans Variable', sans-serif",
  "JetBrains Mono": "'JetBrains Mono Variable', monospace",
};
export const LP_FONTS = Object.keys(FONT_STACK);

/** Renders Template A (image selection) or B (direct chat). Shared by public pages and the builder preview. */
export function LandingRender({ page, orgName, employees, onChat, mobile, verified, onService }: {
  page: LandingPageInput; orgName: string; employees: PublicEmployee[]; onChat: (employeeId?: string, imageId?: string) => void; mobile?: boolean; verified?: boolean; onService?: (serviceId: string) => void;
}) {
  const [slide, setSlide] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
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
      className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 py-4 text-lg font-semibold text-white shadow-lg transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)`, boxShadow: `0 12px 30px -10px ${c}` }}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      <MessageCircle className="relative h-5 w-5" /> <span className="relative">{page.cta_text}</span>
    </button>
  );
  const online = employees.filter((e) => e.status === "online");
  const host = online[0] ?? employees[0];
  const teamStrip = (
    <div className={cn("flex items-center gap-3 rounded-2xl border bg-white/90 px-3 py-2.5 text-left shadow-sm backdrop-blur", mobile ? "" : "max-w-md")} data-testid="lp-team-online">
      <div className="flex -space-x-2">{(online.length ? online : employees).slice(0, 4).map((e) => <span key={e.id} className="rounded-full ring-2 ring-white"><Avatar name={e.name} src={e.avatar} size={30} /></span>)}</div>
      <div className="min-w-0 text-xs text-slate-600">
        {online.length ? <p className="flex items-center gap-1.5 font-semibold text-slate-900"><span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-400" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>{online.length} {online.length === 1 ? "expert" : "experts"} online now</p>
          : <p className="font-semibold text-slate-900">Leave a message and we'll reply soon</p>}
        <p className="truncate">Free chat & voice call · No sign-up needed</p>
      </div>
    </div>
  );
  const preview = host && (
    <div className="flex w-full max-w-sm animate-float items-end gap-2 self-start text-left" data-testid="lp-chat-preview">
      <Avatar name={host.name} src={host.avatar} size={34} />
      <div className="rounded-2xl rounded-bl-md border bg-white px-3 py-2 text-sm text-slate-800 shadow-md">
        <p className="text-[10px] font-semibold" style={{ color: c }}>{host.name}</p>
        <p>Hi 👋 How can I help you today?</p>
        <span className="mt-1 flex gap-1" aria-label="typing">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-typing rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
      </div>
    </div>
  );
  const availability = page.available_24_7 && (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700" data-testid="lp-247-indicator">
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Available 24/7
    </span>
  );

  if (page.template === "C") {
    const svcs = (page.services ?? []).filter((s) => s.active);
    const team = employees.filter((e) => page.assigned_employee_ids.length === 0 || page.assigned_employee_ids.includes(e.id)).slice(0, 6);
    return (
      <div className="min-h-full bg-slate-50 pb-10 text-slate-900" style={{ fontFamily: font }} data-testid="landing-template-c">
        <div className="relative overflow-hidden px-5 pb-16 pt-6 text-white" style={{ background: `linear-gradient(160deg, ${c}, #0B1220)` }}>
          <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-3"><span className="rounded-2xl bg-white p-1 shadow-md">{logo}</span><div className="min-w-0"><p className="text-lg font-bold">{orgName}</p>{verified && <TalksMeVerified dark />}</div></div>
          <h1 className="relative mt-5 text-2xl font-extrabold leading-tight sm:text-3xl" data-testid="lp-title">{page.title}</h1>
          <p className="relative mt-1 text-sm text-white/80">{page.description}</p>
        </div>
        <div className={cn("mx-auto -mt-10 space-y-5 px-4", mobile ? "" : "max-w-3xl")}>
          {team.length > 0 && (
            <div className="rounded-2xl border bg-white p-3 shadow-lg" data-testid="lp-c-team">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Your verified team</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {team.map((e) => (
                  <button key={e.id} onClick={() => onChat(e.id)} className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-xl p-2 text-center transition-colors duration-150 hover:bg-slate-50" data-testid="lp-c-employee">
                    <Avatar name={e.name} src={e.avatar} size={52} status={e.status} />
                    <span className="w-full truncate text-xs font-semibold">{e.name}</span>
                    <span className="w-full truncate text-[10px] text-slate-500">{e.title || "Support"}</span>
                    {e.verified && <span className="rounded-full bg-sky-500/10 px-1.5 text-[9px] font-semibold text-sky-700">✓ Verified</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-bold text-slate-700">Choose a service</p>
            {!svcs.length ? <p className="rounded-2xl border bg-white p-6 text-center text-sm text-slate-500">Services coming soon</p> : (
              <div className={cn("grid gap-3", mobile ? "grid-cols-1" : "sm:grid-cols-2")}>
                {svcs.map((s) => (
                  <button key={s.id} onClick={() => onService?.(s.id)} className="group flex items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]" data-testid="lp-service-card">
                    {s.image ? <img src={s.image} alt={s.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-2xl text-white" style={{ background: c }}>💳</span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="truncate font-bold">{s.name}</p>{s.bonus_pct > 0 && <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white" data-testid="lp-service-bonus">+{s.bonus_pct}% BONUS</span>}</div>
                      {s.brief && <p className="line-clamp-2 text-xs text-slate-500">{s.brief}</p>}
                      <p className="mt-1 text-[11px] font-semibold text-slate-700">₹{s.min_amount.toLocaleString("en-IN")} – ₹{s.max_amount.toLocaleString("en-IN")}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white transition-transform duration-150 group-hover:scale-105" style={{ background: c }}>Add</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {trust}
          <button onClick={() => onChat()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 bg-white py-3 text-sm font-bold" style={{ borderColor: c, color: c }} data-testid="lp-chat-now-button"><MessageCircle className="h-4 w-4" /> Need help? Chat with us</button>
        </div>
      </div>
    );
  }
  if (page.template === "B") {
    return (
      <div className="min-h-full bg-slate-50 text-slate-900" style={{ fontFamily: font }} data-testid="lp-template-b">
        <div className="relative overflow-hidden px-5 pb-10 pt-12 text-center" style={{ background: `radial-gradient(1200px 400px at 50% -10%, ${c}33, transparent)` }}>
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
            {logo}
            <p className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: c }}>{orgName}</p>
            {verified && <TalksMeVerified className="text-xs" />}
            <h1 className={cn("font-bold tracking-tight", mobile ? "text-3xl" : "text-4xl sm:text-5xl")} data-testid="lp-title">{page.title}</h1>
            <p className="text-base text-slate-600">{page.description}</p>
            {availability}
            {teamStrip}
            {preview}
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
      <header className="flex items-center gap-3 px-5 py-4">{logo}<span className="min-w-0"><span className="block font-semibold">{orgName}</span>{verified && <TalksMeVerified className="mt-0.5" />}</span><span className="ml-auto">{availability}</span></header>
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
        <div className="mb-4">{teamStrip}</div>
        <p className="mb-3 text-sm font-semibold text-slate-600">Choose a service</p>
        <div className={cn("grid gap-3", mobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")} role="radiogroup" aria-label="Services">
          {page.images.map((img) => {
            const e = img.employee_id ? empById[img.employee_id] : undefined;
            const on = picked === img.id;
            return (
              <button key={img.id} role="radio" aria-checked={on} onClick={() => setPicked(img.id)} data-testid="lp-service-card"
                className={cn("group flex items-stretch gap-3 overflow-hidden rounded-2xl border-2 bg-white p-2 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg", on ? "shadow-lg" : "border-transparent")}
                style={on ? { borderColor: c } : undefined}>
                <img src={img.url} alt={img.label} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 py-1">
                  <p className="text-sm font-bold text-slate-900">{img.label}</p>
                  {img.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{img.description}</p>}
                  {e && <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">{e.verified && <BadgeCheck className="h-3 w-3" style={{ color: c }} />}{e.name} · <span className={e.status === "online" ? "text-emerald-600" : ""}>{e.status}</span></p>}
                </div>
                <span className={cn("m-1 mt-2 h-5 w-5 shrink-0 rounded-full border-2", on ? "border-[6px]" : "border-slate-300")} style={on ? { borderColor: c } : undefined} />
              </button>
            );
          })}
        </div>
        <button disabled={!picked} onClick={() => { const img = page.images.find((i) => i.id === picked); if (img) onChat(img.employee_id ?? undefined, img.id); }}
          className="sticky bottom-3 mt-4 w-full rounded-2xl py-4 text-base font-bold text-white shadow-xl transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-50" style={{ background: c }} data-testid="lp-start-chat-button">
          {picked ? `${page.cta_text || "Start Chat"}: ${page.images.find((i) => i.id === picked)?.label ?? ""}` : "Select a service to start chat"}
        </button>
      </div>
      <div className="space-y-5 px-5 pb-10">
        {trust}
        <div className="flex items-start gap-2 rounded-2xl bg-slate-900 p-4 text-sm text-slate-200"><Clock className="mt-0.5 h-4 w-4 shrink-0" />Chats are private between you and {orgName}. We never ask for passwords or card PINs in chat.</div>
      </div>
    </div>
  );
}
