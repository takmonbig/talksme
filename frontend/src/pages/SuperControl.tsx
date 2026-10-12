import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, Headphones, Link2, MessageSquarePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, EmptyState, ErrorState, PageHeader, Pager, SkeletonGrid, SortHead, StatusBadge, useTable } from "@/components/common";
import { ChatThread } from "@/components/chat/ChatThread";
import { ImageInput } from "@/lib/media";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { timeAgo, toastErr } from "@/lib/hooks";
import { ExportButtons } from "@/pages/SuperCustomers";
import type { Conversation, JobOut, OrgResetPreview, OrgRow, Plan, SACustomerPick, SALandingRow, StartChatOut, SupportIdentity } from "@/lib/types";

const ALL = "all";

/* ---------------- bulk actions on organizations ---------------- */
type Bulk = "activate" | "suspend" | "archive" | "delete" | "restore" | "plan" | "seats";
const DESTRUCTIVE: Bulk[] = ["suspend", "archive", "delete"];

export function OrgBulkBar({ selected, orgs, plans, onDone }: { selected: string[]; orgs: OrgRow[]; plans: Plan[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [action, setAction] = useState<Bulk | null>(null);
  const [plan, setPlan] = useState("");
  const [seats, setSeats] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<{ updated: number }>("/superadmin/organizations/bulk", { ids: selected, action, plan_id: plan || undefined, seats: seats ? Number(seats) : undefined, reason }),
    onSuccess: (r) => { toast.success(`${r.updated} organization(s) updated`); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); setAction(null); setReason(""); onDone(); },
    onError: toastErr,
  });
  if (!selected.length) return null;
  const names = orgs.filter((o) => selected.includes(o.id)).map((o) => o.name);
  const needsReason = action && DESTRUCTIVE.includes(action);
  const ok = action === "plan" ? !!plan : action === "seats" ? Number(seats) >= 1 : !needsReason || reason.trim().length >= 5;
  return (
    <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-card/95 p-2.5 shadow-lg backdrop-blur" data-testid="org-bulk-bar">
      <span className="px-1 text-sm font-semibold" data-testid="org-bulk-count">{selected.length} selected</span>
      {(["activate", "suspend", "archive", "delete", "plan", "seats"] as Bulk[]).map((a) => (
        <Button key={a} size="sm" variant={DESTRUCTIVE.includes(a) ? "destructive" : "outline"} className="capitalize" onClick={() => setAction(a)} data-testid={`org-bulk-${a}`}>
          {a === "plan" ? "Change plan" : a === "seats" ? "Seat limit" : a}
        </Button>
      ))}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent data-testid="org-bulk-dialog">
          <DialogHeader>
            <DialogTitle className="capitalize">{action === "plan" ? "Change plan" : action === "seats" ? "Change seat limit" : action} {selected.length} organization(s)?</DialogTitle>
            <DialogDescription>{names.slice(0, 6).join(", ")}{names.length > 6 ? ` +${names.length - 6} more` : ""}</DialogDescription>
          </DialogHeader>
          {action === "delete" && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">Soft delete: the organizations are locked and hidden, and their landing pages go offline. Data is kept for 30 days and can be restored by Super Admin.</p>}
          {action === "plan" && (
            <Select value={plan} onValueChange={(v: string) => setPlan(v)}>
              <SelectTrigger data-testid="org-bulk-plan-select"><SelectValue>{(v) => plans.find((p) => p.id === v)?.name ?? "Choose plan"}</SelectValue></SelectTrigger>
              <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {action === "seats" && <Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="Seat limit" data-testid="org-bulk-seats-input" />}
          {needsReason && <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, recorded in the audit log)" data-testid="org-bulk-reason" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button variant={needsReason ? "destructive" : "default"} disabled={!ok || m.isPending} onClick={() => m.mutate()} data-testid="org-bulk-confirm">{m.isPending ? "Working…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Server-side search across org name/domain/ID and Admin name/email/phone. */
export function useOrgSearch(q: string) {
  const [term, setTerm] = useState(q);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  return useQuery({ queryKey: ["sa-org-search", term], queryFn: () => apiGet<string[]>(`/superadmin/org-search?q=${encodeURIComponent(term)}`), enabled: term.length >= 2 });
}

export function OrgCheckbox({ checked, onChange, testid }: { checked: boolean; onChange: (v: boolean) => void; testid: string }) {
  return <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} data-testid={testid} aria-label="Select" />;
}

/* ---------------- secure reset link ---------------- */
export function ResetLinkButton({ uid, name }: { uid: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => apiPost<{ url: string; expires_at: string }>(`/superadmin/users/${uid}/reset-link`), onSuccess: (r) => setUrl(r.url), onError: toastErr });
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending} data-testid="sa-reset-link-button"><Link2 className="h-3.5 w-3.5" /> Reset link</Button>
      <Dialog open={!!url} onOpenChange={(o) => !o && setUrl(null)}>
        <DialogContent data-testid="reset-link-dialog">
          <DialogHeader><DialogTitle>Password reset link for {name}</DialogTitle><DialogDescription>Single use, valid for 24 hours. Share it privately; we never show or store their password.</DialogDescription></DialogHeader>
          <div className="flex gap-2"><Input readOnly value={url ?? ""} data-testid="reset-link-value" /><Button onClick={() => { navigator.clipboard.writeText(url ?? ""); toast.success("Link copied"); }} data-testid="reset-link-copy"><Copy className="h-4 w-4" /></Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- danger zone: reset organization panel ---------------- */
export function OrgDangerZone({ org, onDeleted }: { org: OrgRow; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [job, setJob] = useState<JobOut | null>(null);
  const pre = useQuery({ queryKey: ["sa-reset-preview", org.id], queryFn: () => apiGet<OrgResetPreview>(`/superadmin/organizations/${org.id}/reset-preview`), enabled: open });
  const run = useMutation({ mutationFn: () => apiPost<JobOut>(`/superadmin/organizations/${org.id}/reset`, { password: pw, confirm_name: name, reason }), onSuccess: setJob, onError: toastErr });
  const poll = useQuery({ queryKey: ["sa-job", job?.id], queryFn: () => apiGet<JobOut>(`/superadmin/jobs/${job!.id}`), enabled: !!job, refetchInterval: (q) => (q.state.data?.status === "running" || !q.state.data ? 1000 : false) });
  const status = poll.data?.status ?? job?.status;
  useEffect(() => { if (status === "done") { toast.success(`${org.name} panel reset`); qc.invalidateQueries(); } }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const del = useMutation({ mutationFn: () => apiPost("/superadmin/organizations/bulk", { ids: [org.id], action: "delete", reason: "Deleted from danger zone" }), onSuccess: () => { toast.success("Organization deleted (restorable for 30 days)"); qc.invalidateQueries({ queryKey: ["sa-orgs"] }); onDeleted(); }, onError: toastErr });
  return (
    <div className="mt-6 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4" data-testid="org-danger-zone">
      <p className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> Danger zone</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-destructive/20 pt-3">
        <div><p className="text-sm font-medium">Reset organization panel</p><p className="text-xs text-muted-foreground">Clears chats, customers, deposits and calls for <b>{org.name}</b> only. Billing and audit records are kept.</p></div>
        <Button variant="destructive" size="sm" onClick={() => { setOpen(true); setJob(null); setPw(""); setName(""); setReason(""); }} data-testid="org-reset-panel-button">Reset panel…</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-destructive/20 pt-3">
        <div><p className="text-sm font-medium">Delete organization</p><p className="text-xs text-muted-foreground">Soft delete with 30-day retention. Access is revoked immediately.</p></div>
        <Button variant="outline" size="sm" className="border-destructive text-destructive" onClick={() => { if (window.confirm(`Delete ${org.name}? It can be restored for 30 days.`)) del.mutate(); }} data-testid="org-delete-button">Delete…</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="org-reset-dialog">
          <DialogHeader><DialogTitle>Reset {org.name} panel</DialogTitle><DialogDescription>Runs as a secure backend job for this organization only. A backup snapshot is stored first.</DialogDescription></DialogHeader>
          {job ? (
            <div className="space-y-2 text-sm" data-testid="org-reset-job">
              <p>Job status: <b data-testid="org-reset-job-status">{status}</b></p>
              {poll.data?.status === "done" && <ul className="text-xs">{Object.entries(poll.data.result).map(([k, v]) => <li key={k}>{k}: {String(v)} removed</li>)}</ul>}
            </div>
          ) : !pre.data ? <SkeletonGrid n={2} /> : (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-1 rounded-xl border p-3 text-xs" data-testid="org-reset-counts">{Object.entries(pre.data.will_reset).map(([k, v]) => <p key={k}><span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span> <b>{v}</b></p>)}</div>
              <p className="text-xs text-muted-foreground">Kept: {pre.data.preserved.join(" · ")}</p>
              <div className="rounded-xl border p-2"><ExportButtons org={org.id} label="Back up first" /></div>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your Super Admin password" data-testid="org-reset-password" />
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Type "${org.name}" to confirm`} data-testid="org-reset-confirm-name" />
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded in the audit log)" data-testid="org-reset-reason" />
            </div>
          )}
          {!job && <DialogFooter><Button variant="destructive" disabled={!pw || name.trim() !== org.name || reason.trim().length < 5 || run.isPending} onClick={() => run.mutate()} data-testid="org-reset-confirm">{run.isPending ? "Starting…" : "Reset panel"}</Button></DialogFooter>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- all landing pages A–Z ---------------- */
export function SuperLandingPages() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa-landing"], queryFn: () => apiGet<SALandingRow[]>("/superadmin/landing-pages") });
  const [f, setF] = useState({ org: ALL, emp: ALL, domain: ALL, type: ALL, state: ALL });
  const [dir, setDir] = useState<"az" | "za">("az");
  const [edit, setEdit] = useState<SALandingRow | null>(null);
  const rows = useMemo(() => (q.data ?? []).filter((r) => (f.org === ALL || r.org_name === f.org) && (f.emp === ALL || r.employee_names.includes(f.emp))
    && (f.domain === ALL || (r.domain || "(none)") === f.domain) && (f.type === ALL || r.template === f.type)
    && (f.state === ALL || (f.state === "active" ? r.published && !r.archived : f.state === "inactive" ? !r.published && !r.archived : r.archived)))
    .sort((a, b) => a.title.localeCompare(b.title) * (dir === "az" ? 1 : -1)), [q.data, f, dir]);
  const t = useTable(rows, { search: (r) => `${r.title} ${r.slug} ${r.id} ${r.org_slug}/${r.slug} ${r.domain}`, pageSize: 20 });
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const patch = useMutation({ mutationFn: (x: { id: string; b: Record<string, unknown> }) => apiPatch(`/superadmin/landing-pages/${x.id}`, x.b), onSuccess: () => { toast.success("Landing page updated"); qc.invalidateQueries({ queryKey: ["sa-landing"] }); setEdit(null); }, onError: toastErr });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/superadmin/landing-pages/${id}`), onSuccess: () => { toast.success("Landing page deleted"); qc.invalidateQueries({ queryKey: ["sa-landing"] }); }, onError: toastErr });
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <Select value={f[k]} onValueChange={(v: string) => setF({ ...f, [k]: v })}>
      <SelectTrigger size="sm" className="w-40" data-testid={`sa-lp-filter-${k}`}><SelectValue>{(v) => v === ALL ? label : opts.find((o) => o[0] === v)?.[1] ?? v}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{label}</SelectItem>{opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
  const url = (r: SALandingRow) => `/p/${r.org_slug}/${r.slug}`;
  return (
    <div>
      <PageHeader title="All landing pages" subtitle="Every landing page across every organization." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search title, URL or ID" value={t.q} onChange={(e) => t.setQ(e.target.value)} data-testid="sa-lp-search" />
        {sel("org", "All organizations", uniq((q.data ?? []).map((r) => r.org_name)).map((x) => [x, x]))}
        {sel("emp", "All employees", uniq((q.data ?? []).flatMap((r) => r.employee_names)).map((x) => [x, x]))}
        {sel("domain", "All domains", uniq((q.data ?? []).map((r) => r.domain || "(none)")).map((x) => [x, x]))}
        {sel("type", "All types", [["B", "Chat Now"], ["A", "Choose service"]])}
        {sel("state", "Any status", [["active", "Active"], ["inactive", "Inactive"], ["archived", "Archived"]])}
        <Button size="sm" variant="outline" onClick={() => setDir(dir === "az" ? "za" : "az")} data-testid="sa-lp-sort">{dir === "az" ? "A → Z" : "Z → A"}</Button>
      </div>
      {q.isLoading ? <SkeletonGrid /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !t.total ? <EmptyState title="No landing pages match" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Landing page</TableHead><TableHead>Organization</TableHead><TableHead>Employees</TableHead><TableHead>Type</TableHead><TableHead><SortHead label="Visits" k="views" t={t} /></TableHead><TableHead><SortHead label="Leads" k="leads" t={t} /></TableHead><TableHead><SortHead label="Conversions" k="conversions" t={t} /></TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{t.rows.map((r) => (
              <TableRow key={r.id} data-testid="sa-lp-row">
                <TableCell><p className="font-medium" data-testid="sa-lp-title">{r.title}</p><p className="font-mono text-[11px] text-muted-foreground">{r.domain ? `${r.domain}/${r.slug}` : url(r)}</p></TableCell>
                <TableCell>{r.org_name}</TableCell>
                <TableCell className="max-w-48 text-xs">{r.employee_names.join(", ") || "-"}</TableCell>
                <TableCell><Badge variant="secondary">{r.template === "A" ? "Choose service" : "Chat Now"}</Badge></TableCell>
                <TableCell>{r.views}</TableCell><TableCell>{r.leads}</TableCell><TableCell>{r.conversions}</TableCell>
                <TableCell><StatusBadge status={r.archived ? "archived" : r.published ? "active" : "inactive"} /></TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  <Button size="xs" variant="outline" render={<a href={url(r)} target="_blank" rel="noopener noreferrer" />} data-testid="sa-lp-preview"><ExternalLink className="h-3.5 w-3.5" /></Button>
                  <Button size="xs" variant="outline" onClick={() => setEdit(r)} data-testid="sa-lp-edit">Edit</Button>
                  <Button size="xs" variant="outline" onClick={() => patch.mutate({ id: r.id, b: { published: !r.published, archived: false } })} data-testid="sa-lp-toggle">{r.published ? "Deactivate" : "Activate"}</Button>
                  {!r.archived && <Button size="xs" variant="ghost" onClick={() => patch.mutate({ id: r.id, b: { archived: true } })} data-testid="sa-lp-archive">Archive</Button>}
                  <Button size="xs" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Delete "${r.title}"? Conversations are kept.`) && del.mutate(r.id)} data-testid="sa-lp-delete">Delete</Button>
                </div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <Pager {...t} />
        </div>
      )}
      {edit && <LpEditDialog row={edit} onSave={(b) => patch.mutate({ id: edit.id, b })} onClose={() => setEdit(null)} pending={patch.isPending} />}
    </div>
  );
}

function LpEditDialog({ row, onSave, onClose, pending }: { row: SALandingRow; onSave: (b: Record<string, unknown>) => void; onClose: () => void; pending: boolean }) {
  const [d, setD] = useState({ title: row.title, cta_text: row.cta_text, description: row.description });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="sa-lp-edit-dialog">
        <DialogHeader><DialogTitle>Edit {row.title}</DialogTitle><DialogDescription>{row.org_name}. Full design editing is in that organization's Admin landing-page builder.</DialogDescription></DialogHeader>
        <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} data-testid="sa-lp-edit-title" />
        <Input value={d.cta_text} onChange={(e) => setD({ ...d, cta_text: e.target.value })} data-testid="sa-lp-edit-cta" />
        <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} data-testid="sa-lp-edit-description" />
        <DialogFooter><Button disabled={d.title.trim().length < 2 || d.cta_text.trim().length < 2 || pending} onClick={() => onSave(d)} data-testid="sa-lp-edit-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- platform support inbox ---------------- */
export function SuperSupport() {
  const qc = useQueryClient();
  const convs = useQuery({ queryKey: ["conversations", "sa-support"], queryFn: () => apiGet<Conversation[]>("/conversations"), refetchInterval: 5000 });
  const [cid, setCid] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const active = convs.data?.find((c) => c.id === cid) ?? null;
  return (
    <div>
      <PageHeader title="Support inbox" subtitle="TalksMe platform-support chats. You reply as the verified TalksMe Support account." actions={<div className="flex gap-2"><IdentityButton /><Button onClick={() => setNewOpen(true)} data-testid="sa-support-new"><MessageSquarePlus className="h-4 w-4" /> New message</Button></div>} />
      <div className="grid h-[calc(100dvh-12rem)] min-h-[420px] overflow-hidden rounded-2xl border bg-card md:grid-cols-[300px_1fr]">
        <div className={`overflow-y-auto border-r ${active ? "hidden md:block" : ""}`} data-testid="sa-support-list">
          {convs.isLoading ? <div className="p-3"><SkeletonGrid n={3} /></div> : !convs.data?.length ? <EmptyState title="No support chats yet" text="Customers reach you from 'Connect with Support Agent' on talksme.in." icon={<Headphones className="h-5 w-5" />} /> : convs.data.map((c) => (
            <button key={c.id} onClick={() => setCid(c.id)} className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted ${cid === c.id ? "bg-primary/10" : ""}`} data-testid="sa-support-item">
              <Avatar name={c.customer_name} size={36} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.customer_name}</p><p className="truncate text-xs text-muted-foreground">{c.last_message}</p></div>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">{timeAgo(c.last_message_at)}</p>{c.unread > 0 && <Badge className="h-5 px-1.5 text-[10px]">{c.unread}</Badge>}</div>
            </button>
          ))}
        </div>
        <div className={`min-h-0 ${active ? "flex" : "hidden md:flex"} flex-col`}>
          {active ? <ChatThread conv={active} viewer="employee" onBack={() => setCid(null)} title={active.customer_name} subtitle={active.customer_phone || "Guest"} />
            : <div className="m-auto text-sm text-muted-foreground">Select a conversation</div>}
        </div>
      </div>
      <NewSupportDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => { qc.invalidateQueries({ queryKey: ["conversations", "sa-support"] }); setCid(id); }} />
    </div>
  );
}

function IdentityButton() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa-identity"], queryFn: () => apiGet<SupportIdentity>("/superadmin/support/identity") });
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<SupportIdentity>({ display_name: "TalksMe Support", avatar: "" });
  useEffect(() => { if (q.data) setD(q.data); }, [q.data]);
  const m = useMutation({ mutationFn: () => apiPut<SupportIdentity>("/superadmin/support/identity", d), onSuccess: () => { toast.success("Identity saved"); qc.invalidateQueries({ queryKey: ["sa-identity"] }); setOpen(false); }, onError: toastErr });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="sa-identity-button"><Avatar name={d.display_name} src={d.avatar} size={20} /> {q.data?.display_name ?? "Identity"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="sa-identity-dialog">
          <DialogHeader><DialogTitle>Support identity</DialogTitle><DialogDescription>Customers see this name (plus your first name) on every message. It must include "TalksMe".</DialogDescription></DialogHeader>
          <Input value={d.display_name} onChange={(e) => setD({ ...d, display_name: e.target.value })} data-testid="sa-identity-name" />
          <ImageInput value={d.avatar} onChange={(avatar) => setD({ ...d, avatar })} testid="sa-identity-avatar" />
          <DialogFooter><Button onClick={() => m.mutate()} disabled={m.isPending} data-testid="sa-identity-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewSupportDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<SACustomerPick | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"support" | "announcement">("support");
  const list = useQuery({ queryKey: ["sa-support-customers", q], queryFn: () => apiGet<SACustomerPick[]>(`/superadmin/support/customers?q=${encodeURIComponent(q)}`), enabled: open });
  const m = useMutation({ mutationFn: () => apiPost<StartChatOut>("/superadmin/support/conversations", { customer_user_id: pick!.user_id, text, kind }), onSuccess: (r) => { toast.success("Message sent"); onOpenChange(false); setPick(null); setText(""); if (r.conversation_id) onCreated(r.conversation_id); }, onError: toastErr });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="sa-support-new-dialog">
        <DialogHeader><DialogTitle>Message a customer as TalksMe Support</DialogTitle><DialogDescription>Support messages can go to any customer. Announcements only reach customers who opted in, and include an opt-out line.</DialogDescription></DialogHeader>
        {!pick ? (
          <>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} data-testid="sa-support-customer-search" /></div>
            <div className="max-h-64 overflow-y-auto rounded-xl border">{list.data?.map((c) => (
              <button key={c.user_id} onClick={() => setPick(c)} className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-muted" data-testid="sa-support-customer-option">
                <span><b>{c.name}</b> <span className="text-xs text-muted-foreground">{c.phone || "guest"} · {c.orgs.join(", ")}</span></span>{c.opted_in && <Badge variant="secondary">opted in</Badge>}
              </button>
            ))}</div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">To: <b>{pick.name}</b> <button className="text-xs text-primary underline" onClick={() => setPick(null)}>change</button></p>
            <Select value={kind} onValueChange={(v: string) => setKind(v as "support" | "announcement")}>
              <SelectTrigger data-testid="sa-support-kind"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="support">Support message</SelectItem><SelectItem value="announcement" disabled={!pick.opted_in}>Platform announcement {pick.opted_in ? "" : "(not opted in)"}</SelectItem></SelectContent>
            </Select>
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message. Links are clickable." data-testid="sa-support-text" />
          </div>
        )}
        <DialogFooter><Button disabled={!pick || !text.trim() || m.isPending} onClick={() => m.mutate()} data-testid="sa-support-send">{m.isPending ? "Sending…" : "Send"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

