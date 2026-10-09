import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, EmptyState, ErrorState, PageHeader, Pager, SkeletonGrid, SortHead, StatCard, useTable } from "@/components/common";
import { apiGet } from "@/lib/api";
import { dateTime, money } from "@/lib/hooks";
import { CustomerSheet, ExportButtons } from "@/pages/SuperCustomers";
import type { OrgRow, SACompareRow, SASearchHit } from "@/lib/types";

const ALL = "all";
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 } };

function OrgSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const orgs = useQuery({ queryKey: ["sa-orgs"], queryFn: () => apiGet<OrgRow[]>("/superadmin/organizations") });
  return (
    <Select value={value} onValueChange={(v: string) => onChange(v)}>
      <SelectTrigger className="w-56" data-testid="sa-org-select"><SelectValue>{(v) => v === ALL ? "All organizations" : orgs.data?.find((o) => o.id === v)?.name ?? "Organization"}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>All organizations</SelectItem>{orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-amber-200 px-0.5 text-slate-900">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function SuperSearch() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [org, setOrg] = useState(ALL);
  const [open, setOpen] = useState<{ cust: string; conv: string } | null>(null);
  const q = useQuery({
    queryKey: ["sa-search", term, org],
    queryFn: () => apiGet<SASearchHit[]>(`/superadmin/search?${new URLSearchParams({ q: term, ...(org !== ALL && { org_id: org }) })}`),
    enabled: term.length >= 2,
  });
  const t = useTable(q.data, { search: (h) => `${h.customer_name} ${h.employee_name} ${h.org_name} ${h.text}`, pageSize: 15, initialSort: "created_at" });
  return (
    <div>
      <PageHeader title="Chat search" subtitle="Search a word, phrase or phone number across every organization's chats. Every search is audited." />
      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(input.trim()); }}>
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder='e.g. "refund", "EMI" or 98000 00001' value={input} onChange={(e) => setInput(e.target.value)} data-testid="sa-search-input" />
        </div>
        <OrgSelect value={org} onChange={setOrg} />
        <Button type="submit" className="h-11" disabled={input.trim().length < 2} data-testid="sa-search-submit">Search</Button>
      </form>
      {!term ? <EmptyState title="Search all chats" text="Type at least 2 characters. Phone numbers match on 4 or more digits." icon={<Search className="h-5 w-5" />} />
        : q.isLoading ? <SkeletonGrid /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="No matches" text={`Nothing found for "${term}".`} /> : (
          <div className="rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 p-3">
              <p className="text-sm font-semibold" data-testid="sa-search-count">{q.data.length} result{q.data.length === 1 ? "" : "s"} for "{term}"</p>
              <Input className="ml-auto max-w-xs" placeholder="Filter results…" value={t.q} onChange={(e) => t.setQ(e.target.value)} data-testid="sa-search-filter" />
            </div>
            <Table>
              <TableHeader><TableRow><TableHead><SortHead label="When" k="created_at" t={t} /></TableHead><TableHead>Organization</TableHead><TableHead><SortHead label="Customer" k="customer_name" t={t} /></TableHead><TableHead>Employee</TableHead><TableHead>Match</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{t.rows.map((h, i) => (
                <TableRow key={`${h.conversation_id}-${h.message_id ?? i}`} data-testid="sa-search-hit">
                  <TableCell className="whitespace-nowrap text-xs">{dateTime(h.created_at)}</TableCell>
                  <TableCell>{h.org_name}</TableCell>
                  <TableCell><p className="font-medium">{h.customer_name}</p><p className={`font-mono text-xs ${h.kind === "phone" ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>{h.customer_phone}</p></TableCell>
                  <TableCell>{h.employee_name || "Queue"}</TableCell>
                  <TableCell className="max-w-md">
                    {h.kind === "phone" ? <Badge variant="secondary" className="gap-1"><Phone className="h-3 w-3" /> Phone number match</Badge>
                      : <p className="text-sm"><span className="text-xs text-muted-foreground">{h.sender_name} ({h.sender_role}): </span><Highlight text={h.text} q={term} /></p>}
                  </TableCell>
                  <TableCell><Button size="xs" variant="outline" onClick={() => setOpen({ cust: h.customer_id, conv: h.conversation_id })} data-testid="sa-search-open-chat">Open chat</Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pager page={t.page} pages={t.pages} total={t.total} setPage={t.setPage} />
          </div>
        )}
      {open && <CustomerSheet id={open.cust} initialConv={open.conv} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function SuperCompare() {
  const [org, setOrg] = useState(ALL);
  const q = useQuery({ queryKey: ["sa-compare", org], queryFn: () => apiGet<SACompareRow[]>(`/superadmin/employee-compare${org !== ALL ? `?org_id=${org}` : ""}`) });
  const t = useTable(q.data, { search: (r) => `${r.name} ${r.org_name} ${r.email}`, pageSize: 20, initialSort: "deposits_total" });
  const best = (k: keyof SACompareRow, low = false) => {
    const xs = (q.data ?? []).filter((r) => typeof r[k] === "number" && r.customers > 0);
    return xs.sort((a, b) => ((a[k] as number) - (b[k] as number)) * (low ? 1 : -1))[0];
  };
  const fastest = best("avg_reply_minutes", true);
  const topDep = best("deposits_total");
  const topCust = best("customers");
  const chart = (q.data ?? []).map((r) => ({ name: r.name.split(" ")[0], customers: r.customers, reply: r.avg_reply_minutes ?? 0, deposits: Math.round(r.deposits_total / 1000) }));
  return (
    <div>
      <PageHeader title="Employee comparison" subtitle="Customers handled, reply speed and deposits collected, side by side." actions={<OrgSelect value={org} onChange={setOrg} />} />
      {q.isLoading ? <SkeletonGrid n={6} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="No employees" /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard tone="brand" label="Most customers" value={topCust?.name ?? "—"} hint={topCust ? `${topCust.customers} customers · ${topCust.org_name}` : ""} testid="sa-compare-top-customers" />
            <StatCard tone="success" label="Fastest replies" value={fastest?.name ?? "—"} hint={fastest ? `${fastest.avg_reply_minutes} min average · ${fastest.org_name}` : ""} testid="sa-compare-fastest" />
            <StatCard label="Top deposits" value={topDep?.name ?? "—"} hint={topDep ? `${money(topDep.deposits_total)} · ${topDep.org_name}` : ""} testid="sa-compare-top-deposits" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {([["customers", "Customers handled", "#0284C7"], ["reply", "Avg reply time (min, lower is better)", "#10B981"], ["deposits", "Deposits collected (₹ thousands)", "#F59E0B"]] as const).map(([k, title, color]) => (
              <div key={k} className="rounded-2xl border bg-card p-4" data-testid={`sa-compare-chart-${k}`}>
                <p className="mb-2 text-sm font-semibold">{title}</p>
                <div className="h-52"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" /><YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={32} /><Tooltip {...tip} /><Legend wrapperStyle={{ display: "none" }} /><Bar dataKey={k} fill={color} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Input className="max-w-xs" placeholder="Search employees…" value={t.q} onChange={(e) => t.setQ(e.target.value)} data-testid="sa-compare-search" />
              <div className="ml-auto"><ExportButtons org={org !== ALL ? org : undefined} label="Export all customers & chats" /></div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead><SortHead label="Employee" k="name" t={t} /></TableHead><TableHead>Organization</TableHead>
                  <TableHead className="text-right"><SortHead label="Customers" k="customers" t={t} /></TableHead>
                  <TableHead className="text-right"><SortHead label="Chats" k="conversations" t={t} /></TableHead>
                  <TableHead className="text-right"><SortHead label="Msgs sent" k="messages_sent" t={t} /></TableHead>
                  <TableHead className="text-right"><SortHead label="Avg reply" k="avg_reply_minutes" t={t} /></TableHead>
                  <TableHead className="text-right"><SortHead label="Conversion" k="conversion_rate" t={t} /></TableHead>
                  <TableHead className="text-right"><SortHead label="Deposits" k="deposits_total" t={t} /></TableHead>
                  <TableHead className="text-right">Target</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>{t.rows.map((r) => {
                  const pct = r.target ? Math.min(100, Math.round((r.deposits_total / r.target) * 100)) : 0;
                  return (
                    <TableRow key={r.id} data-testid="sa-compare-row" className={r.active ? "" : "opacity-60"}>
                      <TableCell><div className="flex items-center gap-2"><Avatar name={r.name} src={r.avatar} size={30} /><div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email}</p></div></div></TableCell>
                      <TableCell>{r.org_name}</TableCell>
                      <TableCell className="text-right font-semibold">{r.customers}</TableCell>
                      <TableCell className="text-right">{r.conversations}</TableCell>
                      <TableCell className="text-right">{r.messages_sent}</TableCell>
                      <TableCell className="text-right" data-testid="sa-compare-reply">{r.avg_reply_minutes == null ? "—" : `${r.avg_reply_minutes} min`}</TableCell>
                      <TableCell className="text-right">{r.conversion_rate}% <span className="text-xs text-muted-foreground">({r.converted})</span></TableCell>
                      <TableCell className="text-right font-semibold">{money(r.deposits_total)}<p className="text-xs font-normal text-muted-foreground">{r.deposit_count} payments</p></TableCell>
                      <TableCell className="w-32 text-right">{r.target ? <><div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} /></div><p className="mt-0.5 text-[10px] text-muted-foreground">{pct}% of {money(r.target)}</p></> : "—"}</TableCell>
                      <TableCell><ExportButtons org={r.org_id} employee={r.id} label="" /></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
            <Pager page={t.page} pages={t.pages} total={t.total} setPage={t.setPage} />
          </div>
          <p className="text-xs text-muted-foreground">Average reply = minutes from a customer message to the employee's next reply. Conversion counts customers at the Converted, VIP or Frequent Customer stage. Deposits leave out reversed entries.</p>
        </div>
      )}
    </div>
  );
}
