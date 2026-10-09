import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Building2, Database, DollarSign, Eye, KeyRound, MessageSquare, Plus, Search, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DemoBadge, ErrorState, MockBadge, PageHeader, Pager, SkeletonGrid, SortHead, StatCard, StatusBadge, useTable } from "@/components/common";
import { AnalyticsView } from "@/components/crm/Views";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { compact, dateTime, money, toastErr } from "@/lib/hooks";
import { ImageInput } from "@/lib/media";
import { ResetPasswordDialog } from "@/pages/AdminPages";
import type { OrgDetails, AuditLog, Invoice, OrgRow, Overview, Plan, PlatformSettings, User } from "@/lib/types";

const COLORS = ["#06B6D4", "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B"];
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 } };
const usePlans = () => useQuery({ queryKey: ["plans"], queryFn: () => apiGet<Plan[]>("/superadmin/plans") });
const useOrgs = () => useQuery({ queryKey: ["sa-orgs"], queryFn: () => apiGet<OrgRow[]>("/superadmin/organizations") });

export function SuperDashboard() {
  const o = useQuery({ queryKey: ["sa-overview"], queryFn: () => apiGet<Overview>("/superadmin/overview") });
  const k = o.data?.kpis ?? {};
  const byPlan = Object.entries((o.data?.orgs ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.plan_name]: (a[r.plan_name] ?? 0) + 1 }), {})).map(([name, value]) => ({ name, value }));
  return (
    <div>
      <PageHeader title="Platform command center" subtitle="Every tenant, subscription and system signal at a glance." badge={<DemoBadge />} />
      {o.isLoading && <SkeletonGrid n={8} />}
      {o.isError && <ErrorState onRetry={() => o.refetch()} />}
      {o.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="brand" label="MRR" value={money(k.mrr)} hint={`ARR ${money(k.arr)}`} icon={<DollarSign className="h-4 w-4" />} testid="sa-kpi-mrr" />
            <StatCard label="Organizations" value={k.organizations} hint={`${k.active_organizations} active · ${k.trial_organizations} trial · ${k.suspended_organizations} suspended`} icon={<Building2 className="h-4 w-4" />} testid="sa-kpi-orgs" />
            <StatCard label="People" value={k.employees + k.admins} hint={`${k.admins} admins · ${k.employees} employees · ${k.customers} customers`} icon={<Users className="h-4 w-4" />} testid="sa-kpi-people" />
            <StatCard label="Conversations" value={k.conversations} hint={`${k.active_conversations} active today · ${compact(k.messages)} messages`} icon={<MessageSquare className="h-4 w-4" />} testid="sa-kpi-conversations" />
            <StatCard label="Recorded deposits" value={money(k.deposits)} hint="All tenants, provisional" testid="sa-kpi-deposits" />
            <StatCard label="Renewals due" value={k.renewals_due} hint="next 30 days" />
            <StatCard label="Storage" value={`${k.storage_mb} MB`} hint="chat media (estimated)" icon={<Database className="h-4 w-4" />} />
            <StatCard label="System health" value="Operational" tone="success" hint="Preview environment" icon={<Activity className="h-4 w-4" />} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
              <p className="mb-3 font-heading font-semibold">Conversations & revenue by organization</p>
              <div className="h-64"><ResponsiveContainer><BarChart data={o.data.orgs}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" /><YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" /><Tooltip {...tip} /><Bar dataKey="conversations" fill="#3B82F6" radius={[6, 6, 0, 0]} /><Bar dataKey="customers" fill="#8B5CF6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="mb-3 font-heading font-semibold">Plans in use</p>
              <div className="h-48"><ResponsiveContainer><PieChart><Pie data={byPlan} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={4}>{byPlan.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer></div>
              <div className="space-y-1">{o.data.health.map((h) => <div key={h.name} className="flex items-center justify-between text-xs"><span>{h.name}</span><StatusBadge status={h.status === "operational" ? "active" : h.status === "mocked" ? "pending" : "trial"} /></div>)}</div>
            </div>
          </div>
          <div className="rounded-2xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Seats</TableHead><TableHead className="text-right">Deposits</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader>
              <TableBody>{o.data.orgs.map((r) => <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.plan_name}</TableCell><TableCell><StatusBadge status={r.status} /></TableCell><TableCell className="text-right">{r.employees}/{r.seats}</TableCell><TableCell className="text-right">{money(r.deposits_total)}</TableCell><TableCell className="text-right">{money(r.mrr)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function AccessDialog({ org, onClose }: { org: OrgRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<{ conversations: { id: string; customer_name: string; employee_name: string; last_message: string; last_message_at: string }[]; staff: { name: string; email: string; role: string; active: boolean }[] } | null>(null);
  const m = useMutation({ mutationFn: () => apiPost<NonNullable<typeof data>>(`/superadmin/organizations/${org.id}/access`, { reason, password }), onSuccess: (d) => { setData(d); toast.success("Support access granted · audited"); }, onError: toastErr });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-testid="support-access-dialog">
        <DialogHeader><DialogTitle>Support & compliance access · {org.name}</DialogTitle>
          <DialogDescription>Step-up authentication required. Your reason, identity, timestamp and the resources viewed are recorded in the audit log. Passwords and secrets are never shown.</DialogDescription></DialogHeader>
        {!data ? (
          <div className="space-y-3">
            <div className="space-y-1"><Label>Access reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Investigating ticket #4821 about missing messages" data-testid="access-reason-input" /></div>
            <div className="space-y-1"><Label>Re-enter your password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="access-password-input" /></div>
            <DialogFooter><Button disabled={reason.trim().length < 10 || !password || m.isPending} onClick={() => m.mutate()} data-testid="access-submit-button"><KeyRound className="h-4 w-4" /> Verify & open read-only view</Button></DialogFooter>
          </div>
        ) : (
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto sm:grid-cols-2" data-testid="support-access-result">
            <div><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Recent conversations</p>{data.conversations.map((c) => <div key={c.id} className="border-b py-1.5 text-xs"><b>{c.customer_name}</b> ↔ {c.employee_name || "queue"}<p className="truncate text-muted-foreground">{c.last_message}</p></div>)}</div>
            <div><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Staff</p>{data.staff.map((s) => <div key={s.email} className="border-b py-1.5 text-xs"><b>{s.name}</b> · {s.role}<p className="text-muted-foreground">{s.email}</p></div>)}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const plans = usePlans();
  const blank = { name: "", slug: "", plan_id: "plan-starter", seats: "3", admin_name: "", admin_email: "", admin_password: "", trial: true };
  const [f, setF] = useState(blank);
  const m = useMutation({ mutationFn: () => apiPost<OrgRow>("/superadmin/organizations", { ...f, seats: Number(f.seats) }), onSuccess: (o) => { toast.success(`${o.name} created with admin account`); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); qc.invalidateQueries({ queryKey: ["sa-admins"] }); onOpenChange(false); setF(blank); }, onError: toastErr });
  const valid = f.name.length >= 2 && /^[a-z0-9-]{2,40}$/.test(f.slug) && f.admin_name.length >= 2 && /^\S+@\S+\.\S+$/.test(f.admin_email) && f.admin_password.length >= 8;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="new-org-dialog">
        <DialogHeader><DialogTitle>Create organization</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) })} data-testid="org-create-name" /></div>
          <div className="space-y-1"><Label>Slug</Label><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} data-testid="org-create-slug" /></div>
          <div className="space-y-1"><Label>Plan</Label><Select value={f.plan_id} onValueChange={(v: string) => setF({ ...f, plan_id: v })}><SelectTrigger className="w-full" data-testid="org-create-plan"><SelectValue>{(v) => plans.data?.find((p) => p.id === v)?.name ?? "Plan"}</SelectValue></SelectTrigger><SelectContent>{plans.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Seat limit</Label><Input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} data-testid="org-create-seats" /></div>
          <div className="space-y-1"><Label>Admin name</Label><Input value={f.admin_name} onChange={(e) => setF({ ...f, admin_name: e.target.value })} data-testid="org-create-admin-name" /></div>
          <div className="space-y-1"><Label>Admin email</Label><Input type="email" value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} data-testid="org-create-admin-email" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Admin password</Label><Input type="password" value={f.admin_password} onChange={(e) => setF({ ...f, admin_password: e.target.value })} placeholder="min 8 characters" data-testid="org-create-admin-password" /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.trial} onCheckedChange={(v) => setF({ ...f, trial: !!v })} /> Start as trial</label>
        </div>
        <DialogFooter><Button disabled={!valid || m.isPending} onClick={() => m.mutate()} data-testid="org-create-submit">Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FEATURES: Record<string, string> = { broadcasts: "Broadcasts", audio_calls: "Audio calls", landing_builder: "Landing-page builder", advanced_analytics: "Advanced analytics", deposits: "Deposit ledger", quick_replies: "Quick replies" };

function OrgDetailsDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["sa-org-details", id], queryFn: () => apiGet<OrgDetails>(`/superadmin/organizations/${id}/details`) });
  const [reset, setReset] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sa-org-details", id] }); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); };
  const feat = useMutation({ mutationFn: (features: Record<string, boolean>) => apiPatch<OrgRow>(`/superadmin/organizations/${id}`, { features, reason: "Feature entitlements updated" }), onSuccess: () => { toast.success("Features updated"); refresh(); }, onError: toastErr });
  const toggleUser = useMutation({ mutationFn: (u: { id: string; active: boolean }) => apiPatch(`/superadmin/users/${u.id}?active=${u.active}`), onSuccess: () => { toast.success("User updated"); refresh(); }, onError: toastErr });
  const o = d.data?.org;
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="org-details-dialog">
        <DialogHeader><DialogTitle>{o?.name ?? "Organization"}</DialogTitle><DialogDescription>{o && `${o.slug} · ${o.domain || "no domain"} · ${o.plan_name} · ${o.status} · ${o.employees}/${o.seats} seats`}</DialogDescription></DialogHeader>
        {!d.data ? <SkeletonGrid /> : (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Customers" value={o!.customers} /><StatCard label="Conversations" value={o!.conversations} /><StatCard label="Deposits" value={money(o!.deposits_total)} /><StatCard label="MRR" value={money(o!.mrr)} />
            </div>
            <div className="rounded-xl border p-3">
              <p className="mb-2 font-semibold">Enabled functions (paid features)</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(FEATURES).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2" data-testid={`org-feature-${k}`}>
                    <Checkbox checked={o!.features?.[k] !== false} onCheckedChange={(v) => feat.mutate({ ...o!.features, [k]: !!v })} /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-semibold">Admins & employees</p>
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Deposits</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{d.data.staff.map((u) => (
                  <TableRow key={u.id} data-testid="org-staff-row" className={u.active ? "" : "opacity-60"}>
                    <TableCell><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email} · {u.status}</p></TableCell><TableCell className="capitalize">{u.role}</TableCell>
                    <TableCell className="text-right">{u.open_conversations}</TableCell><TableCell className="text-right">{money(u.deposits_total)}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      <Button size="xs" variant="ghost" onClick={() => setReset({ id: u.id, name: u.name })} data-testid="sa-reset-password-button">Reset password</Button>
                      <Button size="xs" variant="outline" onClick={() => toggleUser.mutate({ id: u.id, active: !u.active })} data-testid="sa-user-toggle">{u.active ? "Deactivate" : "Activate"}</Button>
                    </div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="mb-1 font-semibold">Landing pages</p>{d.data.landing_pages.map((l) => <p key={l.id} className="text-xs">{l.title} · /{l.slug} · {l.views} views · {l.leads} leads {l.published ? "" : "(unpublished)"}</p>)}</div>
              <div><p className="mb-1 font-semibold">Invoices</p>{d.data.invoices.slice(0, 8).map((i) => <p key={i.id} className="text-xs">{dateTime(i.date)} · {money(i.amount)} · {i.status}</p>)}</div>
            </div>
          </div>
        )}
        {reset && <ResetPasswordDialog name={reset.name} endpoint={`/superadmin/users/${reset.id}/reset-password`} onClose={() => setReset(null)} />}
      </DialogContent>
    </Dialog>
  );
}

export function SuperOrganizations() {
  const qc = useQueryClient();
  const q = useOrgs();
  const plans = usePlans();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<OrgRow | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [suspend, setSuspend] = useState<OrgRow | null>(null);
  const [reason, setReason] = useState("");
  const m = useMutation({ mutationFn: (x: { id: string; b: Record<string, unknown> }) => apiPatch<OrgRow>(`/superadmin/organizations/${x.id}`, x.b), onSuccess: (o) => { toast.success(`${o.name} updated`); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); setSuspend(null); setReason(""); }, onError: toastErr });
  const t = useTable(q.data, { search: (o) => `${o.name} ${o.slug} ${o.domain}` });
  return (
    <div>
      <PageHeader title="Organizations" subtitle="Create tenants, set plans and seat limits, suspend or reactivate." actions={<Button onClick={() => setOpen(true)} data-testid="create-org-button"><Plus className="h-4 w-4" /> New organization</Button>} />
      <div className="rounded-2xl border bg-card">
        <div className="border-b p-3"><Input value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="Search organizations" data-testid="orgs-search-input" /></div>
        <Table>
          <TableHeader><TableRow><TableHead><SortHead label="Organization" k="name" t={t} /></TableHead><TableHead>Plan</TableHead><TableHead>Seats</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><SortHead label="Customers" k="customers" t={t} /></TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {t.rows.map((o) => (
              <TableRow key={o.id} data-testid="org-row">
                <TableCell><p className="font-medium">{o.name}</p><p className="font-mono text-xs text-muted-foreground">{o.domain || o.slug}</p></TableCell>
                <TableCell><Select value={o.plan_id} onValueChange={(v: string) => m.mutate({ id: o.id, b: { plan_id: v } })}><SelectTrigger size="sm" className="w-32" data-testid="org-plan-select"><SelectValue>{(v) => plans.data?.find((p) => p.id === v)?.name ?? o.plan_name}</SelectValue></SelectTrigger><SelectContent>{plans.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></TableCell>
                <TableCell><Input type="number" className="h-8 w-20" defaultValue={o.seats} onBlur={(e) => Number(e.target.value) !== o.seats && m.mutate({ id: o.id, b: { seats: Number(e.target.value) } })} data-testid="org-seats-input" /></TableCell>
                <TableCell><StatusBadge status={o.status} testid="org-status-badge" /></TableCell>
                <TableCell className="text-right">{o.customers}</TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  <Button size="xs" onClick={() => setDetails(o.id)} data-testid="org-details-button">Open</Button>
                  <Button size="xs" variant="outline" onClick={() => setAccess(o)} data-testid="org-access-button"><Eye className="h-3.5 w-3.5" /> Access</Button>
                  {o.status === "suspended" ? <Button size="xs" onClick={() => m.mutate({ id: o.id, b: { status: "active", reason: "Reactivated" } })} data-testid="org-reactivate-button">Reactivate</Button>
                    : <Button size="xs" variant="destructive" onClick={() => setSuspend(o)} data-testid="org-suspend-button">Deactivate</Button>}
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager {...t} />
      </div>
      <NewOrgDialog open={open} onOpenChange={setOpen} />
      {access && <AccessDialog org={access} onClose={() => setAccess(null)} />}
      {details && <OrgDetailsDialog id={details} onClose={() => setDetails(null)} />}
      <Dialog open={!!suspend} onOpenChange={(o) => !o && setSuspend(null)}>
        <DialogContent data-testid="suspend-dialog">
          <DialogHeader><DialogTitle>Suspend {suspend?.name}?</DialogTitle><DialogDescription>Its admins and employees lose access and its landing pages go offline. Data is retained.</DialogDescription></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" data-testid="suspend-reason-input" />
          <DialogFooter><Button variant="destructive" disabled={reason.trim().length < 5} onClick={() => suspend && m.mutate({ id: suspend.id, b: { status: "suspended", reason } })} data-testid="suspend-confirm-button">Suspend</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SuperAdmins() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa-admins"], queryFn: () => apiGet<User[]>("/superadmin/admins") });
  const orgs = useOrgs();
  const [f, setF] = useState({ org_id: "", name: "", email: "", password: "" });
  const create = useMutation({ mutationFn: () => apiPost<User>("/superadmin/admins", f), onSuccess: (u) => { toast.success(`Admin ${u.email} created`); qc.invalidateQueries({ queryKey: ["sa-admins"] }); setF({ org_id: "", name: "", email: "", password: "" }); }, onError: toastErr });
  const toggle = useMutation({ mutationFn: (u: User) => apiPatch<User>(`/superadmin/admins/${u.id}?active=${!u.active}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["sa-admins"] }); toast.success("Admin updated"); }, onError: toastErr });
  const orgName = (id: string | null) => orgs.data?.find((o) => o.id === id)?.name ?? "—";
  const valid = f.org_id && f.name.length >= 2 && /^\S+@\S+\.\S+$/.test(f.email) && f.password.length >= 8;
  return (
    <div>
      <PageHeader title="Admin accounts" subtitle="Organization administrators across the platform." />
      <div className="mb-4 grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-5">
        <Select value={f.org_id} onValueChange={(v: string) => setF({ ...f, org_id: v })}><SelectTrigger className="w-full" data-testid="admin-create-org"><SelectValue>{(v) => (v ? orgName(v as string) : "Organization")}</SelectValue></SelectTrigger><SelectContent>{orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="admin-create-name" />
        <Input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="admin-create-email" />
        <Input placeholder="Password (8+)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="admin-create-password" />
        <Button disabled={!valid || create.isPending} onClick={() => create.mutate()} data-testid="admin-create-submit"><Plus className="h-4 w-4" /> Create admin</Button>
      </div>
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Admin</TableHead><TableHead>Organization</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{q.data?.map((u) => <TableRow key={u.id} data-testid="admin-row"><TableCell><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell><TableCell>{orgName(u.org_id)}</TableCell><TableCell><StatusBadge status={u.active ? "active" : "suspended"} /></TableCell><TableCell><Button size="xs" variant="outline" onClick={() => toggle.mutate(u)} data-testid="admin-toggle-button">{u.active ? "Deactivate" : "Activate"}</Button></TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
    </div>
  );
}

function PlanEditor({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: plan?.name ?? "", price_monthly: String(plan?.price_monthly ?? 0), price_yearly: String(plan?.price_yearly ?? 0), seats: String(plan?.seats ?? 5), features: (plan?.features ?? []).join("\n"), active: plan?.active ?? true });
  const body = () => ({ name: f.name, price_monthly: Number(f.price_monthly), price_yearly: Number(f.price_yearly), seats: Number(f.seats), features: f.features.split("\n").map((x) => x.trim()).filter(Boolean), active: f.active });
  const m = useMutation({ mutationFn: () => (plan ? apiPut<Plan>(`/superadmin/plans/${plan.id}`, body()) : apiPost<Plan>("/superadmin/plans", body())), onSuccess: () => { toast.success("Plan saved"); qc.invalidateQueries({ queryKey: ["plans"] }); onClose(); }, onError: toastErr });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="plan-editor-dialog">
        <DialogHeader><DialogTitle>{plan ? `Edit ${plan.name}` : "New plan"}</DialogTitle><DialogDescription>Example configuration — not final commercial pricing.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="plan-name-input" /></div>
          <div className="space-y-1"><Label>Monthly price (₹)</Label><Input type="number" value={f.price_monthly} onChange={(e) => setF({ ...f, price_monthly: e.target.value })} data-testid="plan-monthly-input" /></div>
          <div className="space-y-1"><Label>Yearly price (₹)</Label><Input type="number" value={f.price_yearly} onChange={(e) => setF({ ...f, price_yearly: e.target.value })} data-testid="plan-yearly-input" /></div>
          <div className="space-y-1"><Label>Included seats</Label><Input type="number" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} data-testid="plan-seats-input" /></div>
          <label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} /> Available for purchase</label>
          <div className="space-y-1 sm:col-span-2"><Label>Features (one per line)</Label><Textarea rows={4} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} data-testid="plan-features-input" /></div>
        </div>
        <DialogFooter><Button disabled={f.name.length < 2 || Number(f.seats) < 1 || m.isPending} onClick={() => m.mutate()} data-testid="plan-save-button">Save plan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SuperSubscriptions() {
  const plans = usePlans();
  const inv = useQuery({ queryKey: ["sa-invoices"], queryFn: () => apiGet<Invoice[]>("/superadmin/invoices") });
  const [edit, setEdit] = useState<Plan | null | "new">(null);
  const t = useTable(inv.data, { search: (i) => `${i.org_name} ${i.plan_name} ${i.status}`, initialSort: "date" });
  const qc = useQueryClient();
  const decide = useMutation({ mutationFn: (x: { id: string; approve: boolean }) => apiPost<Invoice>(`/superadmin/invoices/${x.id}/decide`, { approve: x.approve }), onSuccess: (i) => { toast.success(`Payment ${i.status}`); qc.invalidateQueries({ queryKey: ["sa-invoices"] }); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); }, onError: toastErr });
  const waiting = (inv.data ?? []).filter((i) => i.status === "awaiting_approval");
  return (
    <div>
      <PageHeader title="Subscriptions" subtitle="Plans, seat entitlements and invoices across tenants." actions={<Button onClick={() => setEdit("new")} data-testid="create-plan-button"><Plus className="h-4 w-4" /> New plan</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.data?.map((p) => (
          <div key={p.id} className="lift rounded-2xl border bg-card p-5" data-testid="sa-plan-card">
            <div className="flex items-center justify-between"><p className="font-heading text-lg font-bold">{p.name}</p>{!p.active && <StatusBadge status="suspended" />}</div>
            <p className="mt-1 font-heading text-2xl font-extrabold">{money(p.price_monthly)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground">{money(p.price_yearly)}/yr · {p.seats} seats</p>
            <ul className="my-3 space-y-1 text-xs text-muted-foreground">{p.features.map((x) => <li key={x}>• {x}</li>)}</ul>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setEdit(p)} data-testid="plan-edit-button">Edit plan</Button>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border bg-card p-4" data-testid="payment-approvals">
        <p className="mb-2 font-heading font-semibold">Payments awaiting approval ({waiting.length})</p>
        {waiting.length === 0 && <p className="text-sm text-muted-foreground">No payment screenshots to review.</p>}
        {waiting.map((i) => (
          <div key={i.id} className="flex flex-col gap-3 border-t py-3 sm:flex-row sm:items-center" data-testid="payment-approval-row">
            <a href={i.screenshot_url} target="_blank" rel="noreferrer"><img src={i.screenshot_url} alt="screenshot" className="h-20 w-20 rounded-lg border object-cover" /></a>
            <div className="flex-1 text-sm"><p className="font-medium">{i.org_name} · {i.plan_name} ({i.cycle}, {i.seats} seats)</p><p className="text-muted-foreground">{money(i.amount)} · ref {i.reference || "—"} · {dateTime(i.date)}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: i.id, approve: false })} data-testid="payment-reject-button">Reject</Button><Button size="sm" onClick={() => decide.mutate({ id: i.id, approve: true })} data-testid="payment-approve-button">Approve & activate</Button></div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border bg-card">
        <div className="border-b p-3"><Input value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="Search invoices" data-testid="invoices-search-input" /></div>
        <Table>
          <TableHeader><TableRow><TableHead><SortHead label="Date" k="date" t={t} /></TableHead><TableHead>Organization</TableHead><TableHead>Plan</TableHead><TableHead className="text-right"><SortHead label="Amount" k="amount" t={t} /></TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{t.rows.map((i) => <TableRow key={i.id}><TableCell>{dateTime(i.date)}</TableCell><TableCell>{i.org_name}</TableCell><TableCell>{i.plan_name} · {i.cycle} · {i.seats} seats</TableCell><TableCell className="text-right">{money(i.amount)}</TableCell><TableCell><StatusBadge status={i.status} /></TableCell></TableRow>)}</TableBody>
        </Table>
        <Pager {...t} />
      </div>
      {edit && <PlanEditor plan={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function SuperDomains() {
  const qc = useQueryClient();
  const q = useOrgs();
  const [vals, setVals] = useState<Record<string, string>>({});
  const m = useMutation({ mutationFn: (x: { id: string; domain: string }) => apiPatch<OrgRow>(`/superadmin/organizations/${x.id}`, { domain: x.domain, reason: "Domain assignment" }), onSuccess: (o) => { toast.success(`Domain for ${o.name}: ${o.domain || "removed"}`); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); }, onError: toastErr });
  const verify = useMutation({ mutationFn: (id: string) => apiPost<OrgRow>(`/superadmin/organizations/${id}/domain/verify`), onSuccess: (o) => { toast.success(`${o.domain} verified`); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); }, onError: toastErr });
  return (
    <div>
      <PageHeader title="Domain management" subtitle="One custom domain per organization. Verification and TLS are provisioned by the edge." />
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Domain</TableHead><TableHead>Status</TableHead><TableHead>Assign</TableHead></TableRow></TableHeader>
          <TableBody>{q.data?.map((o) => (
            <TableRow key={o.id} data-testid="domain-row"><TableCell className="font-medium">{o.name}</TableCell><TableCell className="font-mono text-xs">{o.domain || "—"}</TableCell><TableCell><StatusBadge status={o.domain_status} /></TableCell>
              <TableCell><div className="flex gap-1"><Input className="h-8 w-52" placeholder="chat.brand.com" value={vals[o.id] ?? ""} onChange={(e) => setVals({ ...vals, [o.id]: e.target.value })} data-testid="sa-domain-input" /><Button size="sm" disabled={!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(vals[o.id] ?? "")} onClick={() => m.mutate({ id: o.id, domain: (vals[o.id] ?? "").toLowerCase() })} data-testid="sa-domain-assign">Assign</Button>{o.domain && o.domain_status !== "verified" && <Button size="sm" variant="outline" onClick={() => verify.mutate(o.id)} data-testid="sa-domain-verify">Mark verified</Button>}</div>
              {o.domain && <p className="mt-1 font-mono text-[10px] text-muted-foreground">CNAME {o.domain} → edge.talksme.in</p>}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </div>
  );
}

export const SuperAnalytics = () => <AnalyticsView endpoint="/superadmin/analytics" title="Platform analytics" subtitle="Aggregated across every organization." />;

export function SuperAuditLogs() {
  const [q, setQ] = useState("");
  const logs = useQuery({ queryKey: ["sa-audit", q], queryFn: () => apiGet<AuditLog[]>(`/superadmin/audit-logs?q=${encodeURIComponent(q)}`) });
  const t = useTable(logs.data, { search: () => "", pageSize: 15 });
  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Immutable record of logins, transfers, deposit changes, billing and privileged access." />
      <div className="rounded-2xl border bg-card">
        <div className="relative border-b p-3"><Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, actor or resource" className="pl-9" data-testid="audit-search-input" /></div>
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead className="hidden md:table-cell">Resource</TableHead><TableHead className="hidden lg:table-cell">Reason</TableHead></TableRow></TableHeader>
          <TableBody>{t.rows.map((l) => <TableRow key={l.id} data-testid="audit-row"><TableCell className="whitespace-nowrap text-xs">{dateTime(l.at)}</TableCell><TableCell><p className="text-sm font-medium">{l.actor_name}</p><p className="text-[11px] text-muted-foreground">{l.actor_role}</p></TableCell><TableCell><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{l.action}</span></TableCell><TableCell className="hidden max-w-xs truncate text-xs md:table-cell">{l.resource}</TableCell><TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground lg:table-cell">{l.reason}</TableCell></TableRow>)}</TableBody>
        </Table>
        <Pager {...t} />
      </div>
    </div>
  );
}

export function SuperSettings() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["sa-settings"], queryFn: () => apiGet<PlatformSettings>("/superadmin/settings") });
  const [preset, setPreset] = useState({ name: "", primary: "#0284C7", accent: "#8B5CF6" });
  const m = useMutation({ mutationFn: (b: PlatformSettings) => apiPut<PlatformSettings>("/superadmin/settings", b), onSuccess: (x) => { qc.setQueryData(["sa-settings"], x); toast.success("Platform settings saved"); }, onError: toastErr });
  if (!s.data) return s.isError ? <ErrorState onRetry={() => s.refetch()} /> : <SkeletonGrid />;
  const d = s.data;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Platform configuration" subtitle="Feature flags, theme presets and retention defaults for all tenants." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border bg-card p-5">
          <p className="font-heading font-semibold">Feature flags</p>
          {Object.entries(d.feature_flags).map(([k, v]) => (
            <label key={k} className="flex items-center justify-between text-sm" data-testid={`flag-${k}`}><span className="capitalize">{k.replace(/_/g, " ")}</span><Checkbox checked={v} onCheckedChange={(x) => m.mutate({ ...d, feature_flags: { ...d.feature_flags, [k]: !!x } })} /></label>
          ))}
          <div className="border-t pt-3"><Label>Default media retention (days)</Label><Input type="number" className="mt-1 w-32" defaultValue={d.default_retention_days} onBlur={(e) => m.mutate({ ...d, default_retention_days: Number(e.target.value) })} data-testid="sa-retention-input" /></div>
          <label className="flex items-center justify-between text-sm"><span>Maintenance mode</span><Checkbox checked={d.maintenance_mode} onCheckedChange={(x) => m.mutate({ ...d, maintenance_mode: !!x })} data-testid="sa-maintenance-checkbox" /></label>
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-5 lg:col-span-2" data-testid="payment-qr-settings">
          <p className="font-heading font-semibold">Subscription payment (UPI QR)</p>
          <p className="text-xs text-muted-foreground">Organization admins see this QR when paying for a plan, then upload their payment screenshot for your approval.</p>
          <ImageInput value={d.payment_qr_url} onChange={(u) => m.mutate({ ...d, payment_qr_url: u })} testid="sa-payment-qr" />
          <div className="flex gap-2"><Input defaultValue={d.upi_id} placeholder="UPI ID e.g. talksme@upi" onBlur={(e) => e.target.value !== d.upi_id && m.mutate({ ...d, upi_id: e.target.value })} data-testid="sa-upi-input" /></div>
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-5">
          <p className="font-heading font-semibold">Theme presets</p>
          {d.theme_presets.map((p, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-2" data-testid="theme-preset">
              <div className="h-8 w-16 rounded-lg" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.accent})` }} /><span className="text-sm font-medium">{p.name}</span>
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => m.mutate({ ...d, theme_presets: d.theme_presets.filter((_, j) => j !== i) })} data-testid="theme-preset-remove">Remove</Button>
            </div>
          ))}
          <div className="flex gap-2"><Input placeholder="Preset name" value={preset.name} onChange={(e) => setPreset({ ...preset, name: e.target.value })} data-testid="theme-preset-name" /><input type="color" value={preset.primary} onChange={(e) => setPreset({ ...preset, primary: e.target.value })} className="h-9 w-10 rounded border" /><input type="color" value={preset.accent} onChange={(e) => setPreset({ ...preset, accent: e.target.value })} className="h-9 w-10 rounded border" />
            <Button disabled={preset.name.trim().length < 2} onClick={() => { m.mutate({ ...d, theme_presets: [...d.theme_presets, preset] }); setPreset({ ...preset, name: "" }); }} data-testid="theme-preset-add">Add</Button></div>
        </div>
      </div>
    </div>
  );
}
