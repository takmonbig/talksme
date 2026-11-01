import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Moon, Sun, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOGO } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Platform-issued trust badge for organizations approved by the TalksMe Super Admin. */
export function TalksMeVerified({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", dark ? "border-sky-300/40 bg-sky-400/15 text-sky-100" : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", className)} title="This business has been verified by TalksMe" data-testid="talksme-verified-badge">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden><path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" opacity=".25"/><path fill="currentColor" d="M10.6 15.6l-3.2-3.2 1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4z"/></svg>
      Verified by TalksMe
    </span>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="brand-logo">
      <div className={cn("shrink-0 overflow-hidden", compact ? "h-9 w-9" : "h-10 w-10")}>
        <img src={LOGO} alt="talksme.in" style={{ width: "150%", maxWidth: "none", marginLeft: "-25%", marginTop: "-6%" }} />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-heading text-[17px] font-extrabold tracking-tight">
            talks<span className="text-brand">me</span><span className="text-sky-500">.in</span>
          </div>
          <div className="mt-0.5 text-[10px] font-medium tracking-[0.04em] text-muted-foreground" data-testid="brand-tagline">a product of <b className="font-semibold text-foreground/80">Takmon Boost</b></div>
        </div>
      )}
    </div>
  );
}

export function MockBadge({ label = "MOCKED", className }: { label?: string; className?: string }) {
  return (
    <span data-testid="mocked-badge" className={cn("inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400", className)}>
      {label}
    </span>
  );
}

export function DemoBadge() {
  return <MockBadge label="Demo data" className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" />;
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300" data-testid="verified-employee-badge">
      <BadgeCheck className="h-3 w-3" /> Verified Employee
    </span>
  );
}

export function Avatar({ name, src, size = 40, status }: { name: string; src?: string; size?: number; status?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="bg-brand flex h-full w-full items-center justify-center rounded-full font-semibold text-white" style={{ fontSize: size * 0.36 }}>
        {initials}
      </div>
      {src && !broken && <img src={src} alt={name} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full rounded-full object-cover" />}
      {status && (
        <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
          status === "online" ? "bg-emerald-500" : status === "away" ? "bg-amber-400" : "bg-slate-400")} />
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: string; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-[28px]" data-testid="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "default", testid }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "brand"; testid?: string;
}) {
  return (
    <div data-testid={testid} className={cn("lift animate-rise relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm",
      tone === "brand" && "bg-brand border-transparent text-white")}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", tone === "brand" ? "text-white/80" : "text-muted-foreground")}>{label}</p>
        {icon && <div className={cn("rounded-lg p-1.5", tone === "brand" ? "bg-white/15" : "bg-accent text-accent-foreground")}>{icon}</div>}
      </div>
      <div className={cn("mt-2 font-heading text-2xl font-bold tracking-tight",
        tone === "success" && "text-success", tone === "warning" && "text-warning", tone === "danger" && "text-destructive")}>{value}</div>
      {hint && <div className={cn("mt-1 text-xs", tone === "brand" ? "text-white/80" : "text-muted-foreground")}>{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center" data-testid="empty-state">
      <div className="bg-brand-subtle mb-3 rounded-2xl p-3 text-primary">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-heading font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm" data-testid="error-state">
      <p className="font-semibold text-destructive">We couldn't load this data.</p>
      <p className="mt-1 text-muted-foreground">The server may be unavailable in this preview. Other parts of the page still work.</p>
      {onRetry && <Button size="sm" variant="outline" className="mt-3" onClick={onRetry} data-testid="retry-button">Retry</Button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

export function SkeletonGrid({ n = 4 }: { n?: number }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
}

const STATUS_TONE: Record<string, string> = {
  Recorded: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  Reviewed: "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300",
  Disputed: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",
  Reversed: "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300",
  active: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  paid: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  verified: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  approved: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  sent: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  trial: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  pending: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  scheduled: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  suspended: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",
  failed: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",
  rejected: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",
};
export function StatusBadge({ status, testid }: { status: string; testid?: string }) {
  return (
    <span data-testid={testid ?? "status-badge"} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
      STATUS_TONE[status] ?? "bg-muted text-muted-foreground")}>{status}</span>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Toggle theme" data-testid="theme-toggle-button">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export type Range = { range: string; frm?: string; to?: string };
const RANGE_LABELS: Record<string, string> = { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time", custom: "Custom range" };
export const rangeQS = (r: Range) => `range=${r.range}${r.range === "custom" && r.frm && r.to ? `&frm=${r.frm}&to=${r.to}` : ""}`;

export function RangeFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="date-range-filter">
      <Select value={value.range} onValueChange={(v: string) => onChange({ ...value, range: v })}>
        <SelectTrigger className="w-40" data-testid="date-range-select"><SelectValue>{(v) => RANGE_LABELS[v as string]}</SelectValue></SelectTrigger>
        <SelectContent>
          {Object.entries(RANGE_LABELS).map(([k, l]) => <SelectItem key={k} value={k} data-testid={`date-range-option-${k}`}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
      {value.range === "custom" && (
        <>
          <Input type="date" className="w-38" value={value.frm ?? ""} onChange={(e) => onChange({ ...value, frm: e.target.value })} data-testid="date-range-from" />
          <Input type="date" className="w-38" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} data-testid="date-range-to" />
        </>
      )}
    </div>
  );
}

/** Client-side search/sort/pagination for tables. */
export function useTable<T>(rows: T[] | undefined, opts: { search: (r: T) => string; pageSize?: number; initialSort?: keyof T }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: keyof T | null; dir: 1 | -1 }>({ key: opts.initialSort ?? null, dir: -1 });
  const [page, setPage] = useState(0);
  const size = opts.pageSize ?? 10;
  const filtered = useMemo(() => {
    let r = (rows ?? []).filter((x) => opts.search(x).toLowerCase().includes(q.toLowerCase()));
    if (sort.key) {
      const k = sort.key;
      r = [...r].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * sort.dir);
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  return {
    q, setQ: (v: string) => { setQ(v); setPage(0); },
    rows: filtered.slice(cur * size, cur * size + size), total: filtered.length, page: cur, pages, setPage,
    sortBy: (key: keyof T) => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : -1 })),
    sort,
  };
}

export function SortHead<T>({ label, k, t }: { label: string; k: keyof T; t: { sortBy: (k: keyof T) => void; sort: { key: keyof T | null; dir: number } } }) {
  return (
    <button className="inline-flex items-center gap-1 font-semibold hover:text-foreground" onClick={() => t.sortBy(k)} data-testid={`sort-${String(k)}`}>
      {label}
      {t.sort.key === k && (t.sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
}

export function Pager({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground" data-testid="table-pager">
      <span>{total} result{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="pager-prev"><ChevronLeft className="h-4 w-4" /></Button>
        <span>{page + 1} / {pages}</span>
        <Button variant="ghost" size="icon-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} data-testid="pager-next"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
