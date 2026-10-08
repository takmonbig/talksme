import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, History, Plus, Search, Wallet, MessageSquare, Users, TrendingUp, Clock, Repeat, Target, Inbox } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Avatar, DemoBadge, EmptyState, ErrorState, PageHeader, Pager, RangeFilter, SkeletonGrid, SortHead, StatCard, StatusBadge,
  rangeQS, useTable, type Range,
} from "@/components/common";
import { CustomerPanel, DepositDialog, STAGES, invalidateCrm } from "@/components/crm/CustomerPanel";
import { apiGet, apiPost } from "@/lib/api";
import { compact, dateTime, money, toastErr } from "@/lib/hooks";
import type { Analytics, CustomerProfile, Deposit, DepositEvent, DepositStatus } from "@/lib/types";

const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 } };

export function AnalyticsView({ endpoint, title, subtitle, showEmployees = true, extra }: {
  endpoint: string; title: string; subtitle?: string; showEmployees?: boolean; extra?: React.ReactNode;
}) {
  const [range, setRange] = useState<Range>({ range: "30d" });
  const enabled = range.range !== "custom" || (!!range.frm && !!range.to);
  const a = useQuery({ queryKey: ["analytics", endpoint, range], queryFn: () => apiGet<Analytics>(`${endpoint}?${rangeQS(range)}`), enabled });
  const k = a.data?.kpis ?? {};
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} badge={<DemoBadge />} actions={<RangeFilter value={range} onChange={setRange} />} />
      {extra}
      {a.isLoading && <SkeletonGrid n={8} />}
      {a.isError && <ErrorState onRetry={() => a.refetch()} />}
      {a.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="brand" label="Provisional deposits" value={money(k.deposits_provisional)} hint={`Reviewed ${money(k.deposits_reviewed)} · not bank-confirmed`} icon={<Wallet className="h-4 w-4" />} testid="kpi-deposits" />
            <StatCard label="Conversations" value={k.conversations} hint={`Today ${k.today_conversations} · Yesterday ${k.yesterday_conversations} · All ${k.all_time_conversations}`} icon={<MessageSquare className="h-4 w-4" />} testid="kpi-conversations" />
            <StatCard label="New leads" value={k.new_leads} hint={`${k.total_customers} customers total`} icon={<Users className="h-4 w-4" />} testid="kpi-new-leads" />
            <StatCard label="Conversion rate" value={`${k.conversion_rate}%`} hint={`${k.converted_customers} converted`} icon={<TrendingUp className="h-4 w-4" />} tone="success" testid="kpi-conversion" />
            <StatCard label="Active (24h)" value={k.active_conversations} hint={`${k.unread_messages} unread`} icon={<Inbox className="h-4 w-4" />} testid="kpi-active" />
            <StatCard label="Avg response" value={`${k.avg_response_minutes}m`} hint="First reply after customer" icon={<Clock className="h-4 w-4" />} testid="kpi-response" />
            <StatCard label="Repeat customers" value={k.repeat_customers} hint={`Avg payment ${money(k.avg_payment)}`} icon={<Repeat className="h-4 w-4" />} testid="kpi-repeat" />
            <StatCard label="Disputed / reversed" value={money(k.deposits_disputed)} hint={`Reversed ${money(k.deposits_reversed)}`} tone="danger" icon={<Target className="h-4 w-4" />} testid="kpi-disputed" />
          </div>
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border bg-card p-4 lg:col-span-3">
              <p className="mb-3 font-heading font-semibold">Deposit trend</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={a.data.series}>
                    <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} /><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => compact(v)} />
                    <Tooltip {...tip} formatter={(v: number) => money(v)} />
                    <Area type="monotone" dataKey="deposits" stroke="#3B82F6" strokeWidth={2} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
              <p className="mb-3 font-heading font-semibold">Conversation volume</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={a.data.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip {...tip} />
                    <Bar dataKey="conversations" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {showEmployees && (
              <div className="rounded-2xl border bg-card p-4" data-testid="employee-performance">
                <p className="mb-3 font-heading font-semibold">Employee performance</p>
                <div className="space-y-3">
                  {a.data.by_employee.map((e) => {
                    const pct = e.target ? Math.min(100, Math.round((100 * e.deposits) / e.target)) : 0;
                    return (
                      <div key={e.id} className="flex items-center gap-3">
                        <Avatar name={e.name} src={e.avatar} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between text-sm"><span className="truncate font-medium">{e.name}</span><span className="font-semibold">{money(e.deposits)}</span></div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="bg-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{e.conversations} chats · {e.conversion}% conversion · {pct}% of {money(e.target)} target</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="rounded-2xl border bg-card p-4">
              <p className="mb-3 font-heading font-semibold">Landing-page attribution</p>
              <Table>
                <TableHeader><TableRow><TableHead>Page</TableHead><TableHead className="text-right">Views</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {a.data.by_landing.map((l) => <TableRow key={l.id}><TableCell className="max-w-40 truncate">{l.title}</TableCell><TableCell className="text-right">{l.views}</TableCell><TableCell className="text-right">{l.leads}</TableCell><TableCell className="text-right font-medium">{money(l.revenue)}</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </div>
            {!showEmployees && null}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-3 font-heading font-semibold">Recent customer activity</p>
            <div className="divide-y">
              {a.data.recent.map((r) => (
                <div key={r.conversation_id} className="flex items-center gap-3 py-2 text-sm"><Avatar name={r.customer_name} size={30} /><span className="font-medium">{r.customer_name}</span><span className="truncate text-muted-foreground">{r.text}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{dateTime(r.at)}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomersView({ admin }: { admin?: boolean }) {
  const [label, setLabel] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["customers", label], queryFn: () => apiGet<CustomerProfile[]>(`/customers${label !== "all" ? `?label=${encodeURIComponent(label)}` : ""}`) });
  const t = useTable(q.data, { search: (c) => `${c.name} ${c.phone} ${c.labels.join(" ")}`, initialSort: "last_active" });
  return (
    <div>
      <PageHeader title={admin ? "Organization CRM" : "My customers"} subtitle="Activity-based and manual labels, lead stages and recorded deposit totals." badge={<DemoBadge />} />
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="Search customers" className="pl-9" data-testid="customers-search-input" /></div>
          <Select value={label} onValueChange={(v: string) => setLabel(v)}>
            <SelectTrigger className="w-48" data-testid="customers-label-filter"><SelectValue>{(v) => (v === "all" ? "All categories" : (v as string))}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {q.isError ? <div className="p-4"><ErrorState onRetry={() => q.refetch()} /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead><SortHead label="Customer" k="name" t={t} /></TableHead><TableHead>Stage</TableHead><TableHead className="hidden md:table-cell">Labels</TableHead>
              {admin && <TableHead className="hidden lg:table-cell">Employee</TableHead>}
              <TableHead className="text-right"><SortHead label="Deposits" k="total_deposits" t={t} /></TableHead><TableHead className="hidden sm:table-cell"><SortHead label="Last active" k="last_active" t={t} /></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading customers…</TableCell></TableRow>}
              {t.rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)} data-testid="customer-row">
                  <TableCell><div className="flex items-center gap-2"><Avatar name={c.name} size={30} /><div><p className="font-medium">{c.name}{c.blocked && <span className="ml-1 text-xs text-destructive">· blocked</span>}</p><p className="text-xs text-muted-foreground">{c.phone}</p></div></div></TableCell>
                  <TableCell><StatusBadge status={c.stage} /></TableCell>
                  <TableCell className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{c.labels.slice(0, 3).map((l) => <span key={l} className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{l}</span>)}</div></TableCell>
                  {admin && <TableCell className="hidden lg:table-cell text-sm">{c.assigned_employee_name || "—"}</TableCell>}
                  <TableCell className="text-right font-medium">{money(c.total_deposits)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{dateTime(c.last_active)}</TableCell>
                </TableRow>
              ))}
              {q.data && t.total === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="No customers found" text="Try another search or category." /></TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
        <Pager {...t} />
      </div>
      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-[360px] overflow-y-auto p-0"><SheetTitle className="sr-only">Customer</SheetTitle>{openId && <CustomerPanel customerId={openId} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function DepositHistory({ d, admin, onClose }: { d: Deposit; admin?: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const ev = useQuery({ queryKey: ["deposit-events", d.id], queryFn: () => apiGet<DepositEvent[]>(`/deposits/${d.id}/events`) });
  const [status, setStatus] = useState<DepositStatus>(d.status === "Recorded" ? "Reviewed" : "Disputed");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const done = () => { invalidateCrm(qc); qc.invalidateQueries({ queryKey: ["deposit-events", d.id] }); setReason(""); setAmount(""); };
  const st = useMutation({ mutationFn: () => apiPost<Deposit>(`/deposits/${d.id}/status`, { status, reason }), onSuccess: (x) => { toast.success(`Deposit marked ${x.status}`); done(); onClose(); }, onError: toastErr });
  const corr = useMutation({ mutationFn: () => apiPost<Deposit>(`/deposits/${d.id}/correction`, { amount: Number(amount), reason }), onSuccess: () => { toast.success("Correction entry appended"); done(); onClose(); }, onError: toastErr });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="deposit-history-dialog">
        <DialogHeader>
          <DialogTitle>{money(d.amount, d.currency)} · {d.customer_name}</DialogTitle>
          <DialogDescription>{d.product} · {d.method} · Ref {d.reference} · paid {d.payment_date}{d.proof_name && ` · proof: ${d.proof_name}`}</DialogDescription>
        </DialogHeader>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Append-only audit trail</p>
          <ol className="relative space-y-3 border-l pl-4" data-testid="deposit-events">
            {ev.data?.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="bg-brand absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full" />
                <p className="font-medium">{e.action === "correction" ? `Amount corrected ${money(e.old_amount ?? 0)} → ${money(e.new_amount ?? 0)}` : e.action === "recorded" ? `Recorded ${money(e.new_amount ?? 0)}` : `${e.from_status} → ${e.to_status}`}</p>
                <p className="text-xs text-muted-foreground">{e.actor_name} · {dateTime(e.at)}{e.reason && ` · "${e.reason}"`}</p>
              </li>
            ))}
          </ol>
        </div>
        {admin && d.status !== "Reversed" && (
          <div className="space-y-3 rounded-xl border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>New status</Label>
                <Select value={status} onValueChange={(v: string) => setStatus(v as DepositStatus)}>
                  <SelectTrigger className="w-full" data-testid="deposit-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["Reviewed", "Disputed", "Reversed", "Recorded"] as const).filter((s) => s !== d.status).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Corrected amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="optional" data-testid="deposit-correction-amount" /></div>
            </div>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required for dispute, reversal and corrections)" rows={2} data-testid="deposit-reason-input" />
            <DialogFooter>
              <Button variant="outline" disabled={!(Number(amount) > 0) || reason.trim().length < 5 || corr.isPending} onClick={() => corr.mutate()} data-testid="deposit-correction-button">Append correction</Button>
              <Button disabled={st.isPending} onClick={() => st.mutate()} data-testid="deposit-status-submit">Apply status</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DepositsView({ admin }: { admin?: boolean }) {
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState<Deposit | null>(null);
  const q = useQuery({ queryKey: ["deposits", status], queryFn: () => apiGet<Deposit[]>(`/deposits${status !== "all" ? `?status=${status}` : ""}`) });
  const customers = useQuery({ queryKey: ["customers", "all"], queryFn: () => apiGet<CustomerProfile[]>("/customers") });
  const t = useTable(q.data, { search: (d) => `${d.customer_name} ${d.reference} ${d.product} ${d.employee_name}`, initialSort: "created_at" });
  const sum = (s: string) => (q.data ?? []).filter((d) => d.status === s).reduce((a, d) => a + d.amount, 0);
  const exportCsv = () => {
    const rows = [["Date", "Customer", "Employee", "Amount", "Currency", "Product", "Method", "Reference", "Status"], ...(q.data ?? []).map((d) => [d.payment_date, d.customer_name, d.employee_name, d.amount, d.currency, d.product, d.method, d.reference, d.status])];
    const blob = new Blob([rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "deposits.csv"; a.click();
  };
  return (
    <div>
      <PageHeader title={admin ? "Deposit ledger" : "Deposits"} subtitle="Manual records. Recorded amounts are provisional and are not confirmed bank receipts." badge={<DemoBadge />}
        actions={<>
          <Button variant="outline" onClick={exportCsv} data-testid="deposits-export-button"><Download className="h-4 w-4" /> Export CSV</Button>
          <Button onClick={() => setOpen(true)} data-testid="record-deposit-button"><Plus className="h-4 w-4" /> Record deposit</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Recorded" value={money(sum("Recorded"))} hint="Awaiting review" testid="deposit-sum-recorded" />
        <StatCard label="Reviewed" value={money(sum("Reviewed"))} tone="success" testid="deposit-sum-reviewed" />
        <StatCard label="Disputed" value={money(sum("Disputed"))} tone="warning" testid="deposit-sum-disputed" />
        <StatCard label="Reversed" value={money(sum("Reversed"))} tone="danger" testid="deposit-sum-reversed" />
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="Search customer, reference, product" className="pl-9" data-testid="deposits-search-input" /></div>
          <Select value={status} onValueChange={(v: string) => setStatus(v)}>
            <SelectTrigger className="w-44" data-testid="deposits-status-filter"><SelectValue>{(v) => (v === "all" ? "All statuses" : (v as string))}</SelectValue></SelectTrigger>
            <SelectContent>{["all", "Recorded", "Reviewed", "Disputed", "Reversed"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {q.isError ? <div className="p-4"><ErrorState onRetry={() => q.refetch()} /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead><SortHead label="Date" k="created_at" t={t} /></TableHead><TableHead>Customer</TableHead>{admin && <TableHead className="hidden md:table-cell">Employee</TableHead>}
              <TableHead className="hidden lg:table-cell">Product</TableHead><TableHead className="hidden lg:table-cell">Reference</TableHead>
              <TableHead className="text-right"><SortHead label="Amount" k="amount" t={t} /></TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading ledger…</TableCell></TableRow>}
              {t.rows.map((d) => (
                <TableRow key={d.id} data-testid="deposit-row">
                  <TableCell className="text-xs">{d.payment_date}</TableCell>
                  <TableCell className="font-medium">{d.customer_name}</TableCell>
                  {admin && <TableCell className="hidden md:table-cell text-sm">{d.employee_name}</TableCell>}
                  <TableCell className="hidden lg:table-cell text-sm">{d.product}</TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">{d.reference}</TableCell>
                  <TableCell className="text-right font-semibold">{money(d.amount, d.currency)}</TableCell>
                  <TableCell><StatusBadge status={d.status} testid="deposit-status-badge" /></TableCell>
                  <TableCell><Button size="xs" variant="ghost" onClick={() => setHist(d)} data-testid="deposit-history-button"><History className="h-3.5 w-3.5" />{admin ? "Audit" : "History"}</Button></TableCell>
                </TableRow>
              ))}
              {q.data && t.total === 0 && <TableRow><TableCell colSpan={8}><EmptyState title="No deposits" text="Recorded payments will appear here." /></TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
        <Pager {...t} />
      </div>
      <DepositDialog open={open} onOpenChange={setOpen} customers={customers.data} />
      {hist && <DepositHistory d={hist} admin={admin} onClose={() => setHist(null)} />}
    </div>
  );
}
