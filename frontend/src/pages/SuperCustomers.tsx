import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileSpreadsheet, FileText, MessageSquare, Radio, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, EmptyState, ErrorState, PageHeader, Pager, SkeletonGrid, SortHead, StatCard, StatusBadge, useTable } from "@/components/common";
import { apiGet } from "@/lib/api";
import { isTyping, onRealtime, watching, wsSend } from "@/lib/realtime";
import { dateTime, money, timeAgo } from "@/lib/hooks";
import type { Message, OrgRow, SACustomerDetail, SACustomerRow, SAEmployee } from "@/lib/types";

const ALL = "all";

function Field({ label, value, testid }: { label: string; value: React.ReactNode; testid?: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2" data-testid={testid}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function Transcript({ convId }: { convId: string }) {
  const q = useQuery({ queryKey: ["sa-transcript", convId], queryFn: () => apiGet<Message[]>(`/superadmin/conversations/${convId}/messages`) });
  const [typing, setTyping] = useState(false);
  const [, setTick] = useState(0);
  const refetch = q.refetch;
  useEffect(() => {
    // Silent live watch: the server streams this conversation's events to us; participants are never notified.
    watching.add(convId);
    const watch = () => wsSend({ type: "watch", conversation_id: convId });
    watch();
    const t = setInterval(() => { watch(); setTyping(isTyping(convId)); setTick((n) => n + 1); }, 2000);
    const off = onRealtime((e) => {
      if (e.conversation_id !== convId) return;
      if (e.type === "message") refetch();
      if (e.type === "typing") setTyping(true);
    });
    return () => { off(); clearInterval(t); watching.delete(convId); wsSend({ type: "unwatch", conversation_id: convId }); };
  }, [convId, refetch]);
  const live = (
    <div className="mb-2 flex items-center justify-between text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-600" data-testid="sa-live-badge"><Radio className="h-3 w-3 animate-pulse" /> LIVE · silent watch</span>
      <span className="text-muted-foreground" data-testid="sa-live-typing">{typing ? "Someone is typing…" : "New messages appear instantly"}</span>
    </div>
  );
  if (q.isLoading) return <SkeletonGrid n={2} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <>{live}<EmptyState title="No messages yet" /></>;
  return (
    <>{live}
    <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-xl border bg-muted/20 p-3" data-testid="sa-transcript">
      {q.data.map((m) => {
        const mine = m.sender_role !== "customer";
        const sys = m.sender_role === "system";
        if (sys) return <p key={m.id} className="text-center text-[11px] text-muted-foreground" data-testid="sa-transcript-message">{m.text} · {dateTime(m.created_at)}</p>;
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid="sa-transcript-message">
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "bg-sky-100 text-slate-900 dark:bg-sky-900/40 dark:text-slate-100" : "bg-card"}`}>
              <p className="text-[10px] font-semibold text-muted-foreground">{m.sender_name} · {m.sender_role}</p>
              {m.attachment && (m.attachment.kind === "image" && m.attachment.url
                ? <img src={m.attachment.url} alt={m.attachment.name} className="mt-1 max-h-48 rounded-lg" />
                : m.attachment.kind === "audio" && m.attachment.url ? <audio controls src={m.attachment.url} className="mt-1 h-8" />
                : m.attachment.kind === "video" && m.attachment.url ? <video controls src={m.attachment.url} className="mt-1 max-h-48 rounded-lg" />
                : <a href={m.attachment.url || undefined} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-primary underline"><FileText className="h-3 w-3" />{m.attachment.name}</a>)}
              {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
              <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{dateTime(m.created_at)} · {m.status}</p>
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}

export function ExportButtons({ org, employee, label = "Export" }: { org?: string; employee?: string; label?: string }) {
  const qs = (fmt: string) => `/api/superadmin/export?${new URLSearchParams({ fmt, ...(org && { org_id: org }), ...(employee && { employee_id: employee }) })}`;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-muted-foreground">{label}:</span>}
      <Button size="sm" variant="outline" render={<a href={qs("xlsx")} download data-testid="sa-export-xlsx" />}><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel</Button>
      <Button size="sm" variant="outline" render={<a href={qs("pdf")} download data-testid="sa-export-pdf" />}><FileText className="h-4 w-4 text-red-600" /> PDF</Button>
    </div>
  );
}

export function CustomerSheet({ id, onClose, initialConv }: { id: string; onClose: () => void; initialConv?: string }) {
  const q = useQuery({ queryKey: ["sa-customer", id], queryFn: () => apiGet<SACustomerDetail>(`/superadmin/customers/${id}`) });
  const [conv, setConv] = useState<string | null>(initialConv ?? null);
  const c = q.data?.customer;
  const activeConv = conv ?? q.data?.conversations[0]?.id ?? null;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl" data-testid="sa-customer-sheet">
        <SheetTitle className="sr-only">Customer details</SheetTitle>
        {q.isLoading && <div className="p-6"><SkeletonGrid /></div>}
        {q.isError && <ErrorState onRetry={() => q.refetch()} />}
        {c && q.data && (
          <div className="space-y-5 p-5 text-sm">
            <div className="flex items-center gap-3">
              <Avatar name={c.name} size={52} />
              <div>
                <p className="font-heading text-xl font-semibold" data-testid="sa-customer-name">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.org_name} · customer since {dateTime(c.created_at)}</p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5" /> Read-only. This view is recorded in the audit log.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label="WhatsApp number" value={c.phone} testid="sa-customer-phone" />
              <Field label="Email" value={c.email} testid="sa-customer-email" />
              <Field label="Organization" value={c.org_name} />
              <Field label="Lead stage" value={c.stage} testid="sa-customer-stage" />
              <Field label="Assigned employee" value={c.assigned_employee_name} />
              <Field label="Talked with" value={c.employees.join(", ")} />
              <Field label="Deposits (excl. reversed)" value={`${money(c.total_deposits)} · ${c.deposit_count} payments`} testid="sa-customer-deposits" />
              <Field label="Conversations / messages" value={`${c.conversation_count} / ${c.message_count}`} />
              <Field label="Last active" value={dateTime(c.last_active)} />
              <Field label="Broadcast opt-in" value={c.opted_in ? "Opted in" : "Not opted in"} />
              <Field label="Blocked" value={c.blocked ? "Yes" : "No"} />
              <Field label="Customer ID" value={<span className="font-mono text-xs">{c.id}</span>} />
            </div>
            <div className="flex flex-wrap gap-1" data-testid="sa-customer-labels">{c.labels.length ? c.labels.map((l) => <Badge key={l} variant="secondary">{l}</Badge>) : <span className="text-xs text-muted-foreground">No labels</span>}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="mb-1 font-semibold">Internal notes</p>{c.notes.length ? c.notes.map((n) => <p key={n.id} className="border-b py-1 text-xs"><b>{n.author_name}</b>: {n.text} <span className="text-muted-foreground">· {dateTime(n.created_at)}</span></p>) : <p className="text-xs text-muted-foreground">None</p>}</div>
              <div><p className="mb-1 font-semibold">Follow-ups</p>{c.follow_ups.length ? c.follow_ups.map((f) => <p key={f.id} className="border-b py-1 text-xs">{f.done ? "✓" : "○"} {f.title} · {dateTime(f.due)}</p>) : <p className="text-xs text-muted-foreground">None</p>}</div>
            </div>
            <div>
              <p className="mb-1 font-semibold">Deposits</p>
              {q.data.deposits.length ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Employee</TableHead><TableHead>Method / ref</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{q.data.deposits.map((d) => <TableRow key={d.id} data-testid="sa-customer-deposit-row"><TableCell>{dateTime(d.payment_date)}</TableCell><TableCell>{d.product}</TableCell><TableCell>{d.employee_name}</TableCell><TableCell className="text-xs">{d.method} · {d.reference}</TableCell><TableCell className="text-right">{money(d.amount, d.currency)}</TableCell><TableCell><StatusBadge status={d.status} /></TableCell></TableRow>)}</TableBody>
                </Table>
              ) : <p className="text-xs text-muted-foreground">No deposits recorded</p>}
            </div>
            <div>
              <p className="mb-2 font-semibold">Conversations & full chat history</p>
              {!q.data.conversations.length ? <p className="text-xs text-muted-foreground">No conversations</p> : (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {q.data.conversations.map((cv) => (
                      <button key={cv.id} onClick={() => setConv(cv.id)} data-testid="sa-conversation-tab"
                        className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors duration-150 ${activeConv === cv.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                        <p className="font-semibold">{cv.employee_name || "Queue"} · {cv.landing_title || "Direct"}</p>
                        <p className="text-muted-foreground">{cv.message_count} messages · {timeAgo(cv.last_message_at)}</p>
                      </button>
                    ))}
                  </div>
                  {activeConv && <Transcript convId={activeConv} />}
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function SuperCustomers() {
  const [sp, setSp] = useSearchParams();
  const org = sp.get("org") ?? ALL;
  const emp = sp.get("employee") ?? ALL;
  const [open, setOpen] = useState<string | null>(null);
  const setFilter = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v === ALL) n.delete(k); else n.set(k, v);
    if (k === "org") n.delete("employee");
    setSp(n);
  };
  const orgs = useQuery({ queryKey: ["sa-orgs"], queryFn: () => apiGet<OrgRow[]>("/superadmin/organizations") });
  const emps = useQuery({ queryKey: ["sa-employees", org], queryFn: () => apiGet<SAEmployee[]>(`/superadmin/employees${org !== ALL ? `?org_id=${org}` : ""}`) });
  const qs = new URLSearchParams({ ...(org !== ALL && { org_id: org }), ...(emp !== ALL && { employee_id: emp }) }).toString();
  const custs = useQuery({ queryKey: ["sa-customers", org, emp], queryFn: () => apiGet<SACustomerRow[]>(`/superadmin/customers${qs ? `?${qs}` : ""}`) });
  const t = useTable(custs.data, { search: (r) => `${r.name} ${r.phone} ${r.email} ${r.org_name} ${r.employees.join(" ")} ${r.stage} ${r.labels.join(" ")}`, initialSort: "last_active" });
  const empName = emps.data?.find((e) => e.id === emp)?.name;
  const total = custs.data?.reduce((a, r) => a + r.total_deposits, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Customer explorer" subtitle="Drill down by organization and employee into every customer, their details, deposits and full chat history. Every view is audited." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={org} onValueChange={(v: string) => setFilter("org", v)}>
          <SelectTrigger className="w-56" data-testid="sa-filter-org"><SelectValue>{(v) => v === ALL ? "All organizations" : orgs.data?.find((o) => o.id === v)?.name ?? "Organization"}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All organizations</SelectItem>{orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={emp} onValueChange={(v: string) => setFilter("employee", v)}>
          <SelectTrigger className="w-56" data-testid="sa-filter-employee"><SelectValue>{(v) => v === ALL ? "All employees" : emps.data?.find((e) => e.id === v)?.name ?? "Employee"}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All employees</SelectItem>{emps.data?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} · {e.org_name}</SelectItem>)}</SelectContent>
        </Select>
        {(org !== ALL || emp !== ALL) && <Button variant="ghost" size="sm" onClick={() => setSp(new URLSearchParams())} data-testid="sa-filter-clear">Clear filters</Button>}
        <div className="ml-auto"><ExportButtons org={org !== ALL ? org : undefined} employee={emp !== ALL ? emp : undefined} label={empName ? `Export ${empName}'s customers & chats` : "Export customers & chats"} /></div>
      </div>

      <div className="mb-6 rounded-2xl border bg-card">
        <p className="flex items-center gap-2 border-b px-4 py-3 font-heading font-semibold"><Users className="h-4 w-4" /> Employees — who talks with how many customers</p>
        {emps.isLoading ? <div className="p-4"><SkeletonGrid n={3} /></div> : emps.isError ? <ErrorState onRetry={() => emps.refetch()} /> : !emps.data?.length ? <EmptyState title="No employees" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Organization</TableHead><TableHead className="text-right">Customers</TableHead><TableHead className="text-right">Conversations</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{emps.data.map((e) => (
              <TableRow key={e.id} data-testid="sa-employee-row" className={emp === e.id ? "bg-primary/5" : ""}>
                <TableCell><div className="flex items-center gap-2"><Avatar name={e.name} src={e.avatar} size={30} status={e.status} /><div><p className="font-medium">{e.name}</p><p className="text-xs text-muted-foreground">{e.email}{e.active ? "" : " · deactivated"}</p></div></div></TableCell>
                <TableCell>{e.org_name}</TableCell>
                <TableCell className="text-right font-semibold" data-testid="sa-employee-customers">{e.customers}</TableCell>
                <TableCell className="text-right">{e.conversations}</TableCell>
                <TableCell className="text-right"><Button size="xs" variant={emp === e.id ? "default" : "outline"} onClick={() => { const n = new URLSearchParams(sp); n.set("employee", e.id); n.set("org", e.org_id); setSp(n); }} data-testid="sa-employee-view-customers">View customers</Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={empName ? `Customers of ${empName}` : "Customers"} value={custs.data?.length ?? "…"} testid="sa-customers-count" />
        <StatCard label="Conversations" value={custs.data?.reduce((a, r) => a + r.conversation_count, 0) ?? "…"} icon={<MessageSquare className="h-4 w-4" />} />
        <StatCard label="Deposits (excl. reversed)" value={money(total)} />
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="p-3"><Input placeholder="Search name, phone, email, employee, label…" value={t.q} onChange={(e) => t.setQ(e.target.value)} data-testid="sa-customers-search" /></div>
        {custs.isLoading ? <div className="p-4"><SkeletonGrid /></div> : custs.isError ? <ErrorState onRetry={() => custs.refetch()} /> : !t.total ? <EmptyState title="No customers match" /> : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead><SortHead label="Customer" k="name" t={t} /></TableHead><TableHead>WhatsApp</TableHead><TableHead>Organization</TableHead><TableHead>Employee(s)</TableHead>
                  <TableHead><SortHead label="Stage" k="stage" t={t} /></TableHead><TableHead className="text-right"><SortHead label="Deposits" k="total_deposits" t={t} /></TableHead>
                  <TableHead className="text-right"><SortHead label="Messages" k="message_count" t={t} /></TableHead><TableHead><SortHead label="Last active" k="last_active" t={t} /></TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>{t.rows.map((r) => (
                  <TableRow key={r.id} data-testid="sa-customer-row" className="cursor-pointer" onClick={() => setOpen(r.id)}>
                    <TableCell><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email || "guest"}{r.blocked ? " · blocked" : ""}</p></TableCell>
                    <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                    <TableCell>{r.org_name}</TableCell>
                    <TableCell className="text-xs">{r.employees.join(", ") || "Queue"}</TableCell>
                    <TableCell><Badge variant="secondary">{r.stage}</Badge></TableCell>
                    <TableCell className="text-right">{money(r.total_deposits)}</TableCell>
                    <TableCell className="text-right">{r.message_count}</TableCell>
                    <TableCell className="text-xs">{timeAgo(r.last_active)}</TableCell>
                    <TableCell><Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }} data-testid="sa-customer-view-button"><Eye className="h-3.5 w-3.5" /> View chats</Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <Pager page={t.page} pages={t.pages} total={t.total} setPage={t.setPage} />
          </>
        )}
      </div>
      {open && <CustomerSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
