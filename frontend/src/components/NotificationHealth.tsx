import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellOff, BellRing, BellPlus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, EmptyState, ErrorState, Pager, Skeleton, useTable } from "@/components/common";
import { apiGet, apiPost } from "@/lib/api";
import { dateTime, toastErr } from "@/lib/hooks";
import type { NotifyHealthRow, NotifyRemindOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const PILL: Record<NotifyHealthRow["status"], { label: string; cls: string }> = {
  on: { label: "On", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  off: { label: "Off · no device", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  muted: { label: "Turned off", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

/** Admin view: who has push notifications on (devices + last subscribed), with a one-tap reminder per person. */
export function NotificationHealthPanel({ kind }: { kind: "employee" | "customer" }) {
  const qc = useQueryClient();
  const key = ["notification-health", kind];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<NotifyHealthRow[]>(`/admin/notification-health?kind=${kind}`) });
  const remind = useMutation({
    mutationFn: (uid: string) => apiPost<NotifyRemindOut>("/admin/notification-health/remind", { user_id: uid }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: key }); },
    onError: toastErr,
  });
  const t = useTable(q.data, { search: (r) => `${r.name} ${r.contact} ${r.status}`, pageSize: 10 });
  const rows = q.data ?? [];
  const on = rows.filter((r) => r.status === "on").length;
  const pct = rows.length ? Math.round((on / rows.length) * 100) : 0;
  const recent = (at: string) => !!at && Date.now() - new Date(at).getTime() < 5 * 60 * 1000;
  return (
    <div className="rounded-2xl border bg-card" data-testid={`notify-health-${kind}`}>
      <div className="flex flex-wrap items-center gap-4 border-b p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><BellRing className="h-5 w-5" /></span>
          <div>
            <p className="text-2xl font-bold leading-none" data-testid="notify-health-coverage">{q.isLoading ? "–" : `${pct}%`}</p>
            <p className="text-xs text-muted-foreground">{on} of {rows.length} {kind === "employee" ? "employees" : "customers"} have notifications on</p>
          </div>
        </div>
        <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
        <Input className="w-full sm:w-64" value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="Search name, contact or status" data-testid="notify-health-search" />
      </div>
      {q.isError ? <div className="p-4"><ErrorState onRetry={() => q.refetch()} /></div> : !q.isLoading && !t.total ? <EmptyState title="Nobody here yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>{kind === "employee" ? "Employee" : "Customer"}</TableHead><TableHead>Notifications</TableHead><TableHead>Devices</TableHead><TableHead className="hidden md:table-cell">Last subscribed</TableHead><TableHead className="text-right">Reminder</TableHead></TableRow></TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={5}><Skeleton className="h-10" /></TableCell></TableRow>}
            {t.rows.map((r) => {
              const cool = recent(r.last_reminded_at);
              return (
                <TableRow key={r.user_id} data-testid="notify-health-row">
                  <TableCell><div className="flex items-center gap-2"><Avatar name={r.name} src={r.avatar} size={30} /><div><p className="font-medium" data-testid="notify-health-name">{r.name}</p><p className="text-xs text-muted-foreground">{r.contact}</p></div></div></TableCell>
                  <TableCell><span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", PILL[r.status].cls)} data-testid="notify-health-status">{r.status === "on" ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}{PILL[r.status].label}</span></TableCell>
                  <TableCell><span className="inline-flex items-center gap-1 text-sm" data-testid="notify-health-devices"><Smartphone className="h-3.5 w-3.5 text-muted-foreground" />{r.devices}</span></TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell" data-testid="notify-health-last">{r.last_subscribed_at ? dateTime(r.last_subscribed_at) : "Never"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="xs" variant={r.status === "on" ? "ghost" : "default"} disabled={cool || (remind.isPending && remind.variables === r.user_id)} onClick={() => remind.mutate(r.user_id)} data-testid="notify-health-remind-button" className="transition-transform duration-150 active:scale-95">
                      <BellPlus className="h-3.5 w-3.5" /> {cool ? "Reminded" : "Remind"}
                    </Button>
                    {r.last_reminded_at && <p className="mt-0.5 text-[10px] text-muted-foreground">Last: {dateTime(r.last_reminded_at)}</p>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pager {...t} />
    </div>
  );
}
