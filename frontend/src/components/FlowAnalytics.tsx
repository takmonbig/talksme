import { useQuery } from "@tanstack/react-query";
import { BarChart3, MousePointerClick } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/common";
import { apiGet } from "@/lib/api";
import type { FlowStats } from "@/lib/types";

function NodeBars({ s }: { s: FlowStats }) {
  return (
    <div className="space-y-3">
      {s.nodes.map((n) => (
        <div key={n.node_id} className="rounded-xl border bg-muted/20 p-3" data-testid="flow-analytics-node">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{n.title}{n.prompt && <span className="ml-1.5 text-xs font-normal text-muted-foreground">“{n.prompt}”</span>}</p>
            <p className="text-[11px] text-muted-foreground" data-testid="flow-analytics-node-counts">{n.answered}/{n.shown} answered</p>
          </div>
          <div className="space-y-1.5">
            {n.options.map((o, i) => (
              <div key={o.option_id} className="flex items-center gap-2 text-xs" data-testid="flow-analytics-option">
                <span className="w-28 shrink-0 truncate font-medium sm:w-36" title={o.label}>{o.label}</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><span className={i === 0 && o.count ? "block h-full rounded-full bg-primary transition-[width] duration-500" : "block h-full rounded-full bg-primary/40 transition-[width] duration-500"} style={{ width: `${o.pct}%` }} /></span>
                <span className="w-20 shrink-0 text-right tabular-nums" data-testid="flow-analytics-option-count">{o.count} · {o.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Which menu options customers tap. One landing page (builder) or every page with a flow (Analytics). */
export function FlowAnalyticsPanel({ landingPageId }: { landingPageId?: string }) {
  const q = useQuery({
    queryKey: ["flow-analytics", landingPageId ?? "all"],
    queryFn: () => apiGet<FlowStats[]>(`/admin/flow-analytics${landingPageId ? `?landing_page_id=${landingPageId}` : ""}`),
  });
  const rows = (q.data ?? []).filter((s) => landingPageId || s.flow_enabled || s.menus_shown);
  return (
    <div className="rounded-2xl border bg-card p-4" data-testid={landingPageId ? "flow-analytics-page" : "flow-analytics-summary"}>
      <p className="mb-3 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> Flow analytics <span className="text-xs font-normal text-muted-foreground">which options customers tap</span></p>
      {q.isLoading ? <Skeleton className="h-32" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length || rows.every((s) => !s.nodes.length) ? (
        <EmptyState title="No menu data yet" text="Turn on a Chat flow with option buttons on a landing page. Taps show up here as customers choose." />
      ) : (
        <div className="space-y-5">
          {rows.map((s) => (
            <div key={s.landing_page_id} className="space-y-3" data-testid="flow-analytics-lp">
              {!landingPageId && <p className="text-sm font-semibold">{s.title} <span className="font-normal text-muted-foreground">/{s.slug}</span>{!s.flow_enabled && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px]">flow off</span>}</p>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Chats", s.chats], ["Menus shown", s.menus_shown], ["Response rate", `${s.response_rate}%`], ["Top option", s.top_option || "–"]].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl border bg-background p-2.5" data-testid="flow-analytics-stat"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p><p className="truncate text-lg font-bold">{v}</p></div>
                ))}
              </div>
              {s.nodes.length ? <NodeBars s={s} /> : <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" /> No option buttons configured on this page yet.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
