import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, BellRing, Flame, MessageCircle, Sparkles, UserPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPatch } from "@/lib/api";
import { toastErr, useMe } from "@/lib/hooks";
import { enableNotifications, useNotificationPermission } from "@/lib/pwa";
import type { Conversation, User } from "@/lib/types";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

/** Live, motivating header for Employee/Admin dashboards: what needs attention right now + one tap into the inbox. */
export function LiveHeroCard() {
  const me = useMe();
  const qc = useQueryClient();
  const perm = useNotificationPermission();
  const q = useQuery({ queryKey: ["conversations", "hero"], queryFn: () => apiGet<Conversation[]>("/conversations"), refetchInterval: 30_000 });
  const status = useMutation({
    mutationFn: (s: string) => apiPatch<User>("/auth/me", { status: s }),
    onSuccess: (u) => { qc.setQueryData(["me"], u); toast.success(u.status === "online" ? "You're online. New customers can reach you." : "You're offline. Routing will skip you."); },
    onError: toastErr,
  });
  const u = me.data;
  if (!u) return null;
  const convs = q.data ?? [];
  const today = new Date().toDateString();
  const unread = convs.filter((c) => c.unread > 0).length;
  const fresh = convs.filter((c) => new Date(c.created_at).toDateString() === today).length;
  const inbox = u.role === "admin" ? "/admin/conversations" : "/employee/inbox";
  const stats = [
    { label: "Waiting for reply", value: unread, icon: Flame, hot: unread > 0, testid: "hero-unread" },
    { label: "New customers today", value: fresh, icon: UserPlus, hot: false, testid: "hero-new-today" },
    { label: "Total chats", value: convs.length, icon: MessageCircle, hot: false, testid: "hero-total" },
  ];
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1220] via-[#10306b] to-primary p-5 text-white shadow-xl sm:p-6" data-testid="live-hero-card">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-400/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-sky-200"><Sparkles className="h-3.5 w-3.5" /> {greet()}</p>
          <h2 className="mt-1 font-heading text-2xl font-bold sm:text-3xl" data-testid="hero-greeting">{u.name.split(" ")[0]}, {unread ? `${unread} ${unread === 1 ? "customer is" : "customers are"} waiting 🔥` : "you're all caught up ✨"}</h2>
          <p className="mt-1 text-sm text-white/70">{unread ? "Fast replies win more customers. Jump in now." : "Share your landing page to bring in new chats."}</p>
        </div>
        {u.role === "employee" && (
          <label className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur" data-testid="hero-online-toggle">
            <span className={u.status === "online" ? "h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" : "h-2 w-2 rounded-full bg-slate-400"} />
            {u.status === "online" ? "Online" : "Offline"}
            <Switch checked={u.status === "online"} disabled={status.isPending} onCheckedChange={(v) => status.mutate(v ? "online" : "offline")} />
          </label>
        )}
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((s) => (
          <div key={s.label} className={s.hot ? "rounded-2xl bg-orange-500/25 p-3 ring-1 ring-orange-300/50 backdrop-blur" : "rounded-2xl bg-white/10 p-3 backdrop-blur"} data-testid={s.testid}>
            <s.icon className={s.hot ? "h-4 w-4 text-orange-200" : "h-4 w-4 text-sky-200"} />
            <p className="mt-1 text-2xl font-bold tabular-nums">{q.isLoading ? "–" : s.value}</p>
            <p className="text-[11px] leading-tight text-white/70">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Link to={inbox} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0B1220] shadow transition-transform duration-150 hover:scale-[1.03] active:scale-95" data-testid="hero-open-inbox">Open inbox <ArrowRight className="h-4 w-4" /></Link>
        {perm !== "granted" && perm !== "unsupported" && (
          <button onClick={() => void enableNotifications()} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors duration-150 hover:bg-white/25" data-testid="hero-enable-notifications"><BellRing className="h-4 w-4" /> Turn on new-customer alerts</button>
        )}
      </div>
    </div>
  );
}
