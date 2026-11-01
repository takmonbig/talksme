import { useState } from "react";
import { EmployeeOnlineSwitch, EmployeeProfileEditor } from "@/components/EmployeeProfileEditor";
import { PixelManager } from "@/components/PixelManager";
import { NotificationHealthPanel } from "@/components/NotificationHealth";
import { EMPTY_FLOW, FlowEditor, flowValid } from "@/components/FlowEditor";
import { IntroVideoCard } from "@/components/IntroFlow";
import { FlowAnalyticsPanel } from "@/components/FlowAnalytics";
import { LiveHeroCard } from "@/components/LiveHero";
import { RechargeEditor, rechargeErrors } from "@/components/recharge/RechargeEditor";
import { extractPixelId } from "@/lib/pixel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Check, Copy, ExternalLink, Globe, Monitor, Plus, Smartphone, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, EmptyState, ErrorState, MockBadge, PageHeader, Pager, Skeleton, StatCard, StatusBadge, VerifiedBadge, useTable } from "@/components/common";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import { LandingRender, LP_FONTS } from "@/components/LandingRender";
import { AnalyticsView, CustomersView, DepositsView } from "@/components/crm/Views";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { ImageInput, uploadFile } from "@/lib/media";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { dateTime, money, toastErr, uid } from "@/lib/hooks";
import type { EmployeeDetails, Ok, AuditLog, Billing, Broadcast, EmployeeStat, Invoice, LandingPage, LandingPageInput, Organization, Routing, Transfer, User } from "@/lib/types";
import { cn } from "@/lib/utils";

function PendingTransfers() {
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ["transfers"], queryFn: () => apiGet<Transfer[]>("/transfers"), refetchInterval: 8000 });
  const m = useMutation({
    mutationFn: (x: { id: string; approve: boolean }) => apiPost<Transfer>(`/transfers/${x.id}/decide`, { approve: x.approve }),
    onSuccess: (x) => { toast.success(`Transfer ${x.status}`); ["transfers", "conversations", "analytics", "customers"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: toastErr,
  });
  const pending = (t.data ?? []).filter((x) => x.status === "pending");
  return (
    <div className="mb-6 rounded-2xl border bg-card p-4" data-testid="pending-transfers">
      <div className="mb-2 flex items-center justify-between"><p className="font-heading font-semibold">Transfer approvals</p><span className="text-xs text-muted-foreground">{pending.length} pending</span></div>
      {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending transfer requests.</p>}
      {pending.map((x) => (
        <div key={x.id} className="flex flex-col gap-2 border-t py-3 text-sm sm:flex-row sm:items-center" data-testid="pending-transfer-row">
          <div className="flex-1"><p><b>{x.customer_name}</b>: {x.from_employee_name} → <b>{x.to_employee_name}</b></p><p className="text-xs text-muted-foreground">"{x.reason}" · {dateTime(x.created_at)}</p></div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => m.mutate({ id: x.id, approve: false })} data-testid="transfer-reject-button"><X className="h-3.5 w-3.5" /> Reject</Button>
            <Button size="sm" onClick={() => m.mutate({ id: x.id, approve: true })} data-testid="transfer-approve-button"><Check className="h-3.5 w-3.5" /> Approve</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export const AdminDashboard = () => <><LiveHeroCard /><AnalyticsView endpoint="/analytics" title="Organization dashboard" subtitle="Team, customers, deposits and landing-page performance." extra={<PendingTransfers />} /></>;
export const AdminAnalytics = () => <><AnalyticsView endpoint="/analytics" title="Organization analytics" subtitle="Employee KPIs, revenue attribution and conversion." /><div className="mt-6"><FlowAnalyticsPanel /></div></>;
function WithNotifyTab({ kind, label, children }: { kind: "employee" | "customer"; label: string; children: React.ReactNode }) {
  return (
    <Tabs defaultValue="list">
      <TabsList className="mb-4" data-testid={`${kind}-tabs`}><TabsTrigger value="list" data-testid={`${kind}-tab-list`}>{label}</TabsTrigger><TabsTrigger value="notifications" data-testid={`${kind}-tab-notifications`}><BellRing className="h-3.5 w-3.5" /> Notifications</TabsTrigger></TabsList>
      <TabsContent value="list">{children}</TabsContent>
      <TabsContent value="notifications"><NotificationHealthPanel kind={kind} /></TabsContent>
    </Tabs>
  );
}
export const AdminCustomers = () => <WithNotifyTab kind="customer" label="Customers"><CustomersView admin /></WithNotifyTab>;
export const AdminDeposits = () => <DepositsView admin />;
export const AdminConversations = () => <InboxWorkspace mode="admin" />;

// ---------------- employees ----------------
function NewEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const blank = { name: "", email: "", password: "", title: "Sales Associate", target: "100000" };
  const [f, setF] = useState(blank);
  const m = useMutation({
    mutationFn: () => apiPost<User>("/admin/employees", { ...f, target: Number(f.target) || 0 }),
    onSuccess: (u) => { toast.success(`${u.name} added`); qc.invalidateQueries({ queryKey: ["employees"] }); onOpenChange(false); setF(blank); },
    onError: toastErr,
  });
  const valid = f.name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(f.email) && f.password.length >= 8;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-employee-dialog">
        <DialogHeader><DialogTitle>Add employee</DialogTitle><DialogDescription>Uses one seat. They sign in with this email and password.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="employee-name-input" /></div>
          <div className="space-y-1"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="employee-title-input" /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="employee-email-input" /></div>
          <div className="space-y-1"><Label>Temporary password</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="min 8 characters" data-testid="employee-password-input" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Monthly deposit target (₹)</Label><Input type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} data-testid="employee-target-input" /></div>
        </div>
        <DialogFooter><Button disabled={!valid || m.isPending} onClick={() => m.mutate()} data-testid="employee-create-submit">Create employee</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChangePassword() {
  const [f, setF] = useState({ current_password: "", new_password: "" });
  const m = useMutation({ mutationFn: () => apiPatch<Ok>("/auth/password", f), onSuccess: (r) => { toast.success(r.message); setF({ current_password: "", new_password: "" }); }, onError: toastErr });
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5" data-testid="change-password-card">
      <p className="font-heading font-semibold">Change my password</p>
      <Input type="password" placeholder="Current password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} data-testid="current-password-input" />
      <Input type="password" placeholder="New password (min 8)" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} data-testid="new-password-input" />
      <Button disabled={!f.current_password || f.new_password.length < 8 || m.isPending} onClick={() => m.mutate()} data-testid="change-password-submit">Update password</Button>
    </div>
  );
}

export function ResetPasswordDialog({ name, endpoint, onClose }: { name: string; endpoint: string; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const m = useMutation({ mutationFn: () => apiPost<Ok>(endpoint, { password: pw }), onSuccess: (r) => { toast.success(r.message); onClose(); }, onError: toastErr });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="reset-password-dialog">
        <DialogHeader><DialogTitle>Reset password · {name}</DialogTitle><DialogDescription>Share the new password securely. The action is recorded in the audit log.</DialogDescription></DialogHeader>
        <Input type="text" placeholder="New password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password-input" />
        <DialogFooter><Button disabled={pw.length < 8 || m.isPending} onClick={() => m.mutate()} data-testid="reset-password-submit">Reset password</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useQuery({ queryKey: ["employee-details", id], queryFn: () => apiGet<EmployeeDetails>(`/admin/employees/${id}/details`) });
  const e = d.data?.employee;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] overflow-y-auto p-5 sm:max-w-[420px]" data-testid="employee-details-sheet"><SheetTitle className="sr-only">Employee details</SheetTitle>
        {!e ? <Skeleton className="h-64" /> : (
          <div className="space-y-5 text-sm">
            <div className="flex items-center gap-3"><Avatar name={e.name} src={e.avatar} size={56} status={e.status} /><div><p className="font-heading text-lg font-semibold">{e.name}</p><p className="text-xs text-muted-foreground">{e.email} · {e.title}</p><p className="text-xs text-muted-foreground">{e.active ? "Active" : "Inactive"} · {e.verified ? "Verified" : "Unverified"} · calls {e.calls_enabled ? "on" : "off"}</p></div></div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted p-2"><p className="text-lg font-bold">{d.data!.conversations.length}</p>chats</div>
              <div className="rounded-lg bg-muted p-2"><p className="text-lg font-bold">{d.data!.customers}</p>customers</div>
              <div className="rounded-lg bg-muted p-2"><p className="text-lg font-bold">{d.data!.calls}</p>calls</div>
            </div>
            <div><p className="mb-1 font-semibold">Deposits ({money(d.data!.deposits.filter((x) => x.status !== "Reversed").reduce((a, x) => a + x.amount, 0))})</p>
              {d.data!.deposits.slice(0, 10).map((x) => <div key={x.id} className="flex justify-between border-b py-1 text-xs"><span>{x.customer_name} · {x.product}</span><span>{money(x.amount)} <StatusBadge status={x.status} /></span></div>)}</div>
            <div><p className="mb-1 font-semibold">Conversations</p>
              {d.data!.conversations.slice(0, 15).map((c) => <div key={c.id} className="border-b py-1 text-xs"><b>{c.customer_name}</b> · {c.customer_phone}<p className="truncate text-muted-foreground">{c.last_message}</p></div>)}</div>
            <div><p className="mb-1 font-semibold">Recent activity</p>
              {d.data!.activity.map((l) => <p key={l.id} className="text-xs text-muted-foreground"><span className="font-mono">{l.action}</span> · {dateTime(l.at)}</p>)}</div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export const AdminEmployees = () => <WithNotifyTab kind="employee" label="Employees"><AdminEmployeesList /></WithNotifyTab>;
function AdminEmployeesList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ id: string; v: string } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [reset, setReset] = useState<EmployeeStat | null>(null);
  const [del, setDel] = useState<EmployeeStat | null>(null);
  const remove = useMutation({ mutationFn: (id: string) => apiDelete<Ok>(`/admin/employees/${id}`), onSuccess: (r) => { toast.success(r.message); setDel(null); qc.invalidateQueries({ queryKey: ["employees"] }); }, onError: toastErr });
  const q = useQuery({ queryKey: ["employees"], queryFn: () => apiGet<EmployeeStat[]>("/employees") });
  const org = useQuery({ queryKey: ["org"], queryFn: () => apiGet<Organization>("/org") });
  const m = useMutation({
    mutationFn: (x: { id: string; b: Record<string, unknown> }) => apiPatch<User>(`/admin/employees/${x.id}`, x.b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Employee updated"); setTarget(null); },
    onError: toastErr,
  });
  const t = useTable(q.data, { search: (e) => `${e.name} ${e.email} ${e.title}`, initialSort: "deposits_total" });
  const activeCount = (q.data ?? []).filter((e) => e.active).length;
  return (
    <div>
      <PageHeader title="Employees" subtitle="Deactivating an employee revokes access but keeps all their customer data."
        actions={<><span className="text-sm text-muted-foreground" data-testid="seat-usage">{activeCount}/{org.data?.seats ?? "–"} seats</span><Button onClick={() => setOpen(true)} data-testid="add-employee-button"><UserPlus className="h-4 w-4" /> Add employee</Button></>} />
      <div className="rounded-2xl border bg-card">
        <div className="border-b p-3"><Input value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="Search employees" data-testid="employees-search-input" /></div>
        {q.isError ? <div className="p-4"><ErrorState onRetry={() => q.refetch()} /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead className="hidden md:table-cell">Open / total</TableHead><TableHead className="text-right">Deposits</TableHead><TableHead className="hidden lg:table-cell">Target</TableHead><TableHead>Verified</TableHead><TableHead>Calls</TableHead><TableHead>Status / profile</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={7}><Skeleton className="h-10" /></TableCell></TableRow>}
              {t.rows.map((e) => (
                <TableRow key={e.id} data-testid="employee-row" className={cn(!e.active && "opacity-60")}>
                  <TableCell><div className="flex items-center gap-2"><Avatar name={e.name} src={e.avatar} size={34} status={e.status} /><div><p className="flex items-center gap-1 font-medium">{e.name}{e.verified && <VerifiedBadge />}</p><p className="text-xs text-muted-foreground">{e.email} · {e.title}</p></div></div></TableCell>
                  <TableCell className="hidden md:table-cell">{e.open_conversations} / {e.total_conversations}</TableCell>
                  <TableCell className="text-right font-medium">{money(e.deposits_total)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {target?.id === e.id ? (
                      <div className="flex gap-1"><Input className="h-7 w-24" type="number" value={target.v} onChange={(x) => setTarget({ id: e.id, v: x.target.value })} data-testid="employee-target-edit" /><Button size="xs" onClick={() => m.mutate({ id: e.id, b: { target: Number(target.v) } })} data-testid="employee-target-save">Save</Button></div>
                    ) : <button className="text-sm underline-offset-2 hover:underline" onClick={() => setTarget({ id: e.id, v: String(e.target) })} data-testid="employee-target-button">{money(e.target)}</button>}
                  </TableCell>
                  <TableCell><Checkbox checked={e.verified} onCheckedChange={(v) => m.mutate({ id: e.id, b: { verified: !!v } })} data-testid="employee-verified-checkbox" /></TableCell>
                  <TableCell><Checkbox checked={e.calls_enabled} onCheckedChange={(v) => m.mutate({ id: e.id, b: { calls_enabled: !!v } })} data-testid="employee-calls-checkbox" /></TableCell>
                  <TableCell><div className="flex flex-col gap-1"><EmployeeOnlineSwitch e={e} /><EmployeeProfileEditor e={e} /></div></TableCell>
                  <TableCell><Button size="xs" variant={e.active ? "outline" : "default"} onClick={() => m.mutate({ id: e.id, b: { active: !e.active } })} data-testid="employee-active-toggle">{e.active ? "Deactivate" : "Activate"}</Button></TableCell>
                  <TableCell><div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setDetail(e.id)} data-testid="employee-details-button">Details</Button>
                    <Button size="xs" variant="ghost" onClick={() => setReset(e)} data-testid="employee-reset-password-button">Reset password</Button>
                    <Button size="xs" variant="ghost" className="text-destructive" onClick={() => setDel(e)} data-testid="employee-delete-button"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager {...t} />
      </div>
      <NewEmployeeDialog open={open} onOpenChange={setOpen} />
      {detail && <EmployeeDetailSheet id={detail} onClose={() => setDetail(null)} />}
      {reset && <ResetPasswordDialog name={reset.name} endpoint={`/admin/employees/${reset.id}/reset-password`} onClose={() => setReset(null)} />}
      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent data-testid="delete-employee-dialog">
          <DialogHeader><DialogTitle>Delete {del?.name}?</DialogTitle><DialogDescription>Their login is removed and the seat is freed. Conversations, customers and deposits stay with your organization — reassign them from Conversations.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => del && remove.mutate(del.id)} data-testid="delete-employee-confirm">Delete employee</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- landing-page builder ----------------
const ROUTING: Record<Routing, string> = { fixed: "Fixed employee", round_robin: "Round robin", least_busy: "Least-busy available", manual: "Manual admin assignment", team: "Team queue" };
const EMPTY_LP: LandingPageInput = {
  title: "New landing page", slug: "new-page", template: "B", description: "Talk to our team on chat — fast, friendly and secure.", cta_text: "Chat Now",
  primary_color: "#0284C7", font: "Inter", logo_url: "", banner_url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1400&q=70",
  trust_items: ["Verified team members", "Secure, encrypted chat", "Replies in under 5 minutes"], routing: "round_robin", assigned_employee_ids: [], images: [],
  calls_enabled: true, pixel_id: "", pixel_ids: [], published: false, available_24_7: false,
  default_message: "Hello! I am interested in your service. Please share more details.", auto_send_default: false, employee_can_edit_message: false, flow: EMPTY_FLOW, services: [], payment: { upi_id: "", payee_name: "", qr_mode: "auto", qr_image: "", note: "" }, slides: [], trust_links: [],
};

function Builder({ initial, id, org, onDone }: { initial: LandingPageInput; id: string | null; org: Organization; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<LandingPageInput>(initial);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const emps = useQuery({ queryKey: ["employees"], queryFn: () => apiGet<EmployeeStat[]>("/employees") });
  const set = <K extends keyof LandingPageInput>(k: K, v: LandingPageInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () => (id ? apiPut<LandingPage>(`/admin/landing-pages/${id}`, f) : apiPost<LandingPage>("/admin/landing-pages", f)),
    onSuccess: () => { toast.success(id ? "Landing page saved" : "Landing page created"); qc.invalidateQueries({ queryKey: ["landing-pages"] }); onDone(); },
    onError: toastErr,
  });
  const errors: string[] = [];
  if (f.title.trim().length < 2) errors.push("Title is required");
  if (!/^[a-z0-9-]{2,60}$/.test(f.slug)) errors.push("Path: lowercase letters, numbers and dashes");
  if (f.pixel_id && !/^\d{6,20}$/.test(f.pixel_id)) errors.push("Pixel ID must be 6–20 digits");
  if (f.template === "A" && f.images.length === 0) errors.push("Add at least one service card");
  if (f.template === "C") errors.push(...rechargeErrors(f));
  if (!flowValid(f.flow)) errors.push("Chat flow: every message needs text or media, and every option needs a label");
  const empList = emps.data ?? [];
  const pubEmps = empList.map((e) => ({ id: e.id, name: e.name, avatar: e.avatar, title: e.title, status: e.status, verified: e.verified }));
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]" data-testid="landing-builder">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDone} data-testid="builder-back-button">← All pages</Button>
          <Button className="ml-auto" onClick={() => (errors.length ? toast.error(errors[0]) : save.mutate())} disabled={save.isPending} data-testid="builder-save-button">{save.isPending ? "Saving…" : "Save page"}</Button>
        </div>
        <Tabs defaultValue="content">
          <TabsList className="w-full"><TabsTrigger value="content">Content</TabsTrigger><TabsTrigger value="look">Appearance</TabsTrigger><TabsTrigger value="routing">Routing</TabsTrigger><TabsTrigger value="pixel">Pixel</TabsTrigger><TabsTrigger value="flow" data-testid="builder-tab-flow">Chat flow</TabsTrigger></TabsList>
          <TabsContent value="content" className="space-y-3 pt-3">
            <div className="grid grid-cols-3 gap-2">
              {(["B", "A", "C"] as const).map((t) => (
                <button key={t} onClick={() => set("template", t)} data-testid={`builder-template-${t}`} className={cn("rounded-xl border p-3 text-left text-sm transition-colors", f.template === t && "border-primary bg-accent")}>
                  <b>{t === "B" ? "Type A · Chat Now" : t === "A" ? "Type B · Choose service" : "Type C · Recharge"}</b><p className="text-xs text-muted-foreground">{t === "B" ? "Logo, highlights, banner, one big Chat Now button" : t === "A" ? "Service cards (image, name, description), then Start Chat" : "Services with min/max + bonus, UPI QR payment, screenshot verification"}</p>
                </button>
              ))}
            </div>
            {f.template === "C" && <RechargeEditor services={f.services ?? []} payment={f.payment} onServices={(v) => set("services", v)} onPayment={(v) => set("payment", v)} slides={f.slides ?? []} onSlides={(v) => set("slides", v)} trustLinks={f.trust_links ?? []} onTrustLinks={(v) => set("trust_links", v)} />}
            <div className="space-y-1"><Label>Title</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} data-testid="builder-title-input" /></div>
            <div className="space-y-1"><Label>Path</Label><div className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">{org.domain || "your-domain"}/</span><Input value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} data-testid="builder-slug-input" /></div></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} data-testid="builder-description-input" /></div>
            <div className="space-y-1"><Label>CTA text</Label><Input value={f.cta_text} onChange={(e) => set("cta_text", e.target.value)} data-testid="builder-cta-input" /></div>
            <div className="space-y-1">
              <Label>Trust indicators</Label>
              {f.trust_items.map((t, i) => (
                <div key={i} className="flex gap-1"><Input value={t} onChange={(e) => set("trust_items", f.trust_items.map((x, j) => (j === i ? e.target.value : x)))} data-testid="builder-trust-input" /><Button variant="ghost" size="icon" onClick={() => set("trust_items", f.trust_items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
              ))}
              {f.trust_items.length < 6 && <Button size="sm" variant="outline" onClick={() => set("trust_items", [...f.trust_items, "New highlight"])} data-testid="builder-add-trust"><Plus className="h-3.5 w-3.5" /> Add indicator</Button>}
            </div>
            <div className="space-y-1 rounded-xl border p-3" data-testid="builder-default-message">
              <Label>Default customer message</Label>
              <Textarea value={f.default_message} onChange={(e) => set("default_message", e.target.value)} rows={2} maxLength={500} data-testid="builder-default-message-input" />
              <p className="text-[11px] text-muted-foreground">Prefilled in the customer's message box. They can edit it and send it.</p>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.auto_send_default} onCheckedChange={(v) => set("auto_send_default", !!v)} data-testid="builder-auto-send-checkbox" /> Send it automatically (once, as the customer)</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.employee_can_edit_message} onCheckedChange={(v) => set("employee_can_edit_message", !!v)} data-testid="builder-employee-edit-checkbox" /> Assigned employees may edit this message</label>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.available_24_7} onCheckedChange={(v) => set("available_24_7", !!v)} data-testid="builder-247-checkbox" /> Show "Available 24/7" (only if accurate)</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.published} onCheckedChange={(v) => set("published", !!v)} data-testid="builder-published-checkbox" /> Published</label>
          </TabsContent>
          <TabsContent value="look" className="space-y-3 pt-3">
            <div className="space-y-1"><Label>Primary color</Label><div className="flex gap-2"><input type="color" value={f.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="h-9 w-12 rounded border" data-testid="builder-color-input" /><Input value={f.primary_color} onChange={(e) => set("primary_color", e.target.value)} /></div></div>
            <div className="space-y-1"><Label>Font</Label>
              <Select value={f.font} onValueChange={(v: string) => set("font", v)}><SelectTrigger className="w-full" data-testid="builder-font-select"><SelectValue /></SelectTrigger><SelectContent>{LP_FONTS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>Logo URL</Label><ImageInput value={f.logo_url} onChange={(v) => set("logo_url", v)} testid="builder-logo" /></div>
            <div className="space-y-1"><Label>Banner image URL</Label><ImageInput value={f.banner_url} onChange={(v) => set("banner_url", v)} testid="builder-banner" /></div>
            {f.template === "A" && (
              <div className="space-y-2">
                <Label>Service cards (image, name, description, employee)</Label>
                {f.images.map((img, i) => (
                  <div key={img.id} className="flex items-center gap-2 rounded-xl border p-2" data-testid="builder-image-row">
                    <img src={img.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Input className="h-7" value={img.label} placeholder="Service name" onChange={(e) => set("images", f.images.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} data-testid="builder-service-name" />
                      <Input className="h-7" value={img.description} placeholder="Short description" onChange={(e) => set("images", f.images.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} data-testid="builder-service-description" />
                      <Input className="h-7" value={img.default_message} placeholder="Default message for this service (optional)" onChange={(e) => set("images", f.images.map((x, j) => (j === i ? { ...x, default_message: e.target.value } : x)))} data-testid="builder-service-message" />
                      <Select value={img.employee_id ?? ""} onValueChange={(v: string) => set("images", f.images.map((x, j) => (j === i ? { ...x, employee_id: v } : x)))}>
                        <SelectTrigger size="sm" className="w-full" data-testid="builder-image-employee-select"><SelectValue>{(v) => empList.find((e) => e.id === v)?.name ?? "Map to employee"}</SelectValue></SelectTrigger>
                        <SelectContent>{empList.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col">
                      <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => set("images", f.images.map((x, j, a) => (j === i - 1 ? a[i] : j === i ? a[i - 1] : x)))} aria-label="Move up" data-testid="builder-service-up">↑</Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => set("images", f.images.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1">
                  {empList.filter((e) => !f.images.some((i) => i.employee_id === e.id)).map((e) => (
                    <Button key={e.id} size="xs" variant="outline" onClick={() => set("images", [...f.images, { id: uid(), url: e.avatar || "https://i.pravatar.cc/300", label: e.name, description: "", default_message: "", employee_id: e.id }])} data-testid="builder-add-image">+ {e.name}</Button>
                  ))}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted" data-testid="builder-upload-image">
                  <Plus className="h-3 w-3" /> Upload custom image
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const a = await uploadFile(file); set("images", [...f.images, { id: uid(), url: a.url, label: "New service", description: "", default_message: "", employee_id: null }]); toast.success("Image uploaded — map it to an employee"); } catch (err) { toast.error((err as Error).message); } }} />
                </label>
              </div>
            )}
          </TabsContent>
          <TabsContent value="routing" className="space-y-3 pt-3">
            <div className="space-y-1"><Label>Routing strategy</Label>
              <Select value={f.routing} onValueChange={(v: string) => set("routing", v as Routing)}><SelectTrigger className="w-full" data-testid="builder-routing-select"><SelectValue>{(v) => ROUTING[v as Routing]}</SelectValue></SelectTrigger>
                <SelectContent>{Object.entries(ROUTING).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
            <Label>Assigned employees</Label>
            {f.assigned_employee_ids.length === 0 && (
              <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300" data-testid="builder-no-employees-warning">
                {id ? "No employees assigned — new chats will wait in the queue for manual assignment." : "None selected — all active employees will be assigned when you save."}
              </p>
            )}
            {empList.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm" data-testid="builder-employee-option">
                <Checkbox checked={f.assigned_employee_ids.includes(e.id)} onCheckedChange={(v) => set("assigned_employee_ids", v ? [...f.assigned_employee_ids, e.id] : f.assigned_employee_ids.filter((x) => x !== e.id))} />
                <Avatar name={e.name} src={e.avatar} size={24} status={e.status} />{e.name}<span className="ml-auto text-xs text-muted-foreground">{e.open_conversations} open</span>
              </label>
            ))}
            <label className="flex items-center gap-2 border-t pt-3 text-sm"><Checkbox checked={f.calls_enabled} onCheckedChange={(v) => set("calls_enabled", !!v)} data-testid="builder-calls-checkbox" /> Enable audio calling on this page</label>
          </TabsContent>
          <TabsContent value="pixel" className="space-y-3 pt-3">
            <PixelManager ids={[...new Set([...(f.pixel_ids ?? []), f.pixel_id].filter(Boolean))]} onChange={(ids) => setF({ ...f, pixel_ids: ids, pixel_id: ids[0] ?? "" })} />
          </TabsContent>
          <TabsContent value="flow" className="space-y-3 pt-3">
            <FlowEditor value={f.flow} onChange={(flow) => setF({ ...f, flow })} />
            {id && <FlowAnalyticsPanel landingPageId={id} />}
          </TabsContent>
        </Tabs>
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <p className="font-heading font-semibold">Live preview</p>
          <div className="ml-auto flex rounded-lg border p-0.5">
            <Button size="xs" variant={device === "mobile" ? "secondary" : "ghost"} onClick={() => setDevice("mobile")} data-testid="preview-mobile-button"><Smartphone className="h-3.5 w-3.5" /> Mobile</Button>
            <Button size="xs" variant={device === "desktop" ? "secondary" : "ghost"} onClick={() => setDevice("desktop")} data-testid="preview-desktop-button"><Monitor className="h-3.5 w-3.5" /> Desktop</Button>
          </div>
        </div>
        <div className={cn("mx-auto overflow-hidden border bg-slate-50 shadow-2xl transition-[max-width] duration-300", device === "mobile" ? "h-[720px] max-w-[390px] rounded-[40px] border-8 border-slate-900" : "h-[680px] max-w-full rounded-2xl")} data-testid="builder-preview">
          <div className="h-full overflow-y-auto"><LandingRender page={f} orgName={org.name} verified={org.verified} employees={pubEmps} mobile={device === "mobile"} onChat={() => toast("Preview only — publish and open the live page to start a chat")} /></div>
        </div>
      </div>
    </div>
  );
}

export function AdminLandingPages() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; data: LandingPageInput } | null>(null);
  const q = useQuery({ queryKey: ["landing-pages"], queryFn: () => apiGet<LandingPage[]>("/admin/landing-pages") });
  const org = useQuery({ queryKey: ["org"], queryFn: () => apiGet<Organization>("/org") });
  const delLp = useMutation({ mutationFn: (id: string) => apiDelete(`/admin/landing-pages/${id}`), onSuccess: () => { toast.success("Landing page deleted"); qc.invalidateQueries({ queryKey: ["landing-pages"] }); }, onError: toastErr });
  const dup = useMutation({ mutationFn: (id: string) => apiPost<LandingPage>(`/admin/landing-pages/${id}/duplicate`), onSuccess: (p) => { toast.success(`Duplicated as /${p.slug}`); qc.invalidateQueries({ queryKey: ["landing-pages"] }); }, onError: toastErr });
  const toggle = useMutation({
    mutationFn: (p: LandingPage) => apiPut<LandingPage>(`/admin/landing-pages/${p.id}`, { ...p, published: !p.published }),
    onSuccess: (p) => { toast.success(p.published ? "Published" : "Unpublished"); qc.invalidateQueries({ queryKey: ["landing-pages"] }); }, onError: toastErr,
  });
  if (editing && org.data) return <Builder initial={editing.data} id={editing.id} org={org.data} onDone={() => setEditing(null)} />;
  return (
    <div>
      <PageHeader title="Landing pages" subtitle="One custom domain, many paths. Each page routes visitors to the right associate."
        actions={<Button onClick={() => setEditing({ id: null, data: { ...EMPTY_LP, primary_color: org.data?.primary_color ?? EMPTY_LP.primary_color, logo_url: org.data?.logo_url ?? "" } })} data-testid="create-landing-page-button"><Plus className="h-4 w-4" /> New page</Button>} />
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data?.length === 0 && <EmptyState title="No landing pages yet" text="Create your first page to start capturing chats." />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.map((p) => (
          <div key={p.id} className="lift overflow-hidden rounded-2xl border bg-card" data-testid="landing-page-card">
            <div className="relative h-32 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(to top, ${p.primary_color}dd, transparent), url(${p.banner_url})` }}>
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-800">Template {p.template}</span>
              <span className="absolute right-3 top-3"><StatusBadge status={p.published ? "active" : "pending"} /></span>
              <p className="absolute bottom-3 left-3 right-3 truncate font-heading font-semibold text-white">{p.title}</p>
            </div>
            <div className="space-y-3 p-4">
              <p className="truncate font-mono text-xs text-muted-foreground">{org.data?.domain || "domain"}/{p.slug}</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-muted p-2"><p className="font-bold">{p.views}</p>views</div>
                <div className="rounded-lg bg-muted p-2"><p className="font-bold">{p.leads}</p>leads</div>
                <div className="rounded-lg bg-muted p-2"><p className="font-bold">{p.views ? ((100 * p.leads) / p.views).toFixed(1) : 0}%</p>conv.</div>
              </div>
              <p className="text-xs text-muted-foreground">{ROUTING[p.routing]} · {p.assigned_employee_ids.length} employees · calls {p.calls_enabled ? "on" : "off"}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => setEditing({ id: p.id, data: p })} data-testid="landing-edit-button">Edit</Button>
                <Button size="sm" variant="outline" onClick={() => dup.mutate(p.id)} data-testid="landing-duplicate-button"><Copy className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => window.confirm(`Delete "${p.title}"? Its conversations are kept.`) && delLp.mutate(p.id)} data-testid="landing-delete-button"><Trash2 className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={() => toggle.mutate(p)} data-testid="landing-publish-toggle">{p.published ? "Unpublish" : "Publish"}</Button>
                {p.published && org.data && <a href={`/p/${org.data.slug}/${p.slug}`} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" data-testid="landing-open-button"><ExternalLink className="h-3.5 w-3.5" /> Open</Button></a>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- broadcasts ----------------
export function AdminBroadcasts() {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", message: "", segment: "all", scheduled_at: "" });
  const list = useQuery({ queryKey: ["broadcasts"], queryFn: () => apiGet<Broadcast[]>("/admin/broadcasts") });
  const aud = useQuery({ queryKey: ["audience", f.segment], queryFn: () => apiGet<{ eligible: number; total: number }>(`/admin/broadcasts/audience?segment=${encodeURIComponent(f.segment)}`) });
  const m = useMutation({
    mutationFn: () => apiPost<Broadcast>("/admin/broadcasts", { ...f, scheduled_at: f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null }),
    onSuccess: (b) => { toast.success(`Broadcast ${b.status} for ${b.recipients} opted-in customers`); qc.invalidateQueries({ queryKey: ["broadcasts"] }); setF({ title: "", message: "", segment: "all", scheduled_at: "" }); },
    onError: toastErr,
  });
  const valid = f.title.trim().length >= 3 && f.message.trim().length >= 3;
  return (
    <div>
      <PageHeader title="Broadcast center" subtitle="Only customers who opted in receive broadcasts. Limited to 5 per hour." badge={<MockBadge label="Delivery mocked" />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="space-y-1"><Label>Campaign title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="broadcast-title-input" /></div>
          <div className="space-y-1"><Label>Message</Label><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={4} data-testid="broadcast-message-input" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Audience segment</Label>
              <Select value={f.segment} onValueChange={(v: string) => setF({ ...f, segment: v })}><SelectTrigger className="w-full" data-testid="broadcast-segment-select"><SelectValue>{(v) => (v === "all" ? "All opted-in" : (v as string))}</SelectValue></SelectTrigger>
                <SelectContent>{["all", "New Lead", "Interested", "Hot Lead", "Converted", "VIP", "Frequent Customer", "Inactive"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All opted-in" : s}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>Schedule (optional)</Label><Input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} data-testid="broadcast-schedule-input" /></div>
          </div>
          <p className="text-sm" data-testid="broadcast-audience-count"><b>{aud.data?.eligible ?? "–"}</b> of {aud.data?.total ?? "–"} customers have consented and will receive this.</p>
          <Button disabled={!valid || m.isPending} onClick={() => m.mutate()} data-testid="broadcast-send-button">{f.scheduled_at ? "Schedule broadcast" : "Send broadcast"}</Button>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Message preview</p>
          <div className="chat-wall rounded-2xl p-4"><div className="max-w-[85%] rounded-2xl rounded-bl-md bg-bubble-in p-3 text-sm shadow-sm"><p className="font-semibold">{f.title || "Campaign title"}</p><p className="mt-1 whitespace-pre-wrap">{f.message || "Your message appears here."}</p><p className="mt-2 text-[10px] text-muted-foreground">Reply STOP to opt out</p></div></div>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Segment</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Recipients</TableHead><TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Read</TableHead><TableHead className="text-right">Opt-outs</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.data?.map((b) => (
              <TableRow key={b.id} data-testid="broadcast-row"><TableCell><p className="font-medium">{b.title}</p><p className="max-w-xs truncate text-xs text-muted-foreground">{b.message}</p></TableCell><TableCell>{b.segment}</TableCell><TableCell><StatusBadge status={b.status} /></TableCell><TableCell className="text-right">{b.recipients}</TableCell><TableCell className="text-right">{b.delivered}</TableCell><TableCell className="text-right">{b.read}</TableCell><TableCell className="text-right">{b.opted_out}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------- settings ----------------
export function AdminSettings() {
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["org"], queryFn: () => apiGet<Organization>("/org") });
  const logs = useQuery({ queryKey: ["org-audit"], queryFn: () => apiGet<AuditLog[]>("/admin/audit-logs") });
  const [f, setF] = useState<Partial<Organization>>({});
  const m = useMutation({
    mutationFn: () => apiPatch<Organization>("/admin/org", f),
    onSuccess: (o) => { qc.setQueryData(["org"], o); setF({}); toast.success("Organization branding updated"); qc.invalidateQueries({ queryKey: ["org-audit"] }); },
    onError: toastErr,
  });
  if (!org.data) return <Skeleton className="h-64" />;
  const v = { ...org.data, ...f };
  return (
    <div className="max-w-4xl">
      <PageHeader title="Organization settings" subtitle="White-label branding applies across your team workspace and new landing pages." />
      <div className="mb-5"><IntroVideoCard /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="space-y-1"><Label>Organization name</Label><Input value={v.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="org-name-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Primary color</Label><div className="flex gap-2"><input type="color" value={v.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value.toUpperCase() })} className="h-9 w-12 rounded border" data-testid="org-primary-color-input" /><Input value={v.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} /></div></div>
            <div className="space-y-1"><Label>Accent color</Label><div className="flex gap-2"><input type="color" value={v.accent_color} onChange={(e) => setF({ ...f, accent_color: e.target.value.toUpperCase() })} className="h-9 w-12 rounded border" data-testid="org-accent-color-input" /><Input value={v.accent_color} onChange={(e) => setF({ ...f, accent_color: e.target.value })} /></div></div>
          </div>
          <div className="space-y-1"><Label>Font</Label><Select value={v.font} onValueChange={(x: string) => setF({ ...f, font: x })}><SelectTrigger className="w-full" data-testid="org-font-select"><SelectValue /></SelectTrigger><SelectContent>{LP_FONTS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Logo URL</Label><ImageInput value={v.logo_url} onChange={(x) => setF({ ...f, logo_url: x })} testid="org-logo" /></div>
          <div className="space-y-1"><Label>Default banner URL</Label><ImageInput value={v.banner_url} onChange={(x) => setF({ ...f, banner_url: x })} testid="org-banner" /></div>
          <div className="space-y-1"><Label>Chat media retention (days)</Label><Input type="number" min={7} value={v.retention_days} onChange={(e) => setF({ ...f, retention_days: Number(e.target.value) })} data-testid="org-retention-input" /></div>
          <Button disabled={!Object.keys(f).length || m.isPending} onClick={() => m.mutate()} data-testid="org-settings-save">Save branding</Button>
        </div>
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(135deg, ${v.primary_color}cc, ${v.accent_color}cc), url(${v.banner_url})` }} />
            <div className="flex items-center gap-3 p-4">{v.logo_url ? <img src={v.logo_url} alt="" className="h-12 w-12 rounded-xl object-contain" /> : <div className="h-12 w-12 rounded-xl" style={{ background: v.primary_color }} />}<div><p className="font-semibold">{v.name}</p><button className="mt-1 rounded-lg px-3 py-1 text-xs font-semibold text-white" style={{ background: v.primary_color }}>Chat Now</button></div></div>
          </div>
          <ChangePassword />
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-2 font-heading font-semibold">Organization audit log</p>
            <div className="max-h-72 space-y-2 overflow-y-auto text-xs" data-testid="org-audit-log">
              {logs.data?.slice(0, 30).map((l) => <div key={l.id} className="border-b pb-1.5"><p><b>{l.actor_name}</b> · <span className="font-mono">{l.action}</span></p><p className="text-muted-foreground">{l.resource} · {dateTime(l.at)}{l.reason && ` · ${l.reason}`}</p></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- billing ----------------
export function AdminBilling() {
  const qc = useQueryClient();
  const b = useQuery({ queryKey: ["billing"], queryFn: () => apiGet<Billing>("/admin/billing") });
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [seats, setSeats] = useState<number | null>(null);
  const [pending, setPending] = useState<Invoice | null>(null);
  const change = useMutation({ mutationFn: (plan_id: string) => apiPost<Invoice>("/admin/billing/change", { plan_id, cycle, seats: seats ?? b.data?.org.seats }), onSuccess: (i) => { setPending(i); qc.invalidateQueries({ queryKey: ["billing"] }); }, onError: toastErr });
  const [proof, setProof] = useState({ url: "", ref: "" });
  const hook = useMutation({
    mutationFn: (id: string) => apiPost<Invoice>(`/admin/billing/invoices/${id}/proof`, { screenshot_url: proof.url, reference: proof.ref }),
    onSuccess: () => { toast.success("Payment screenshot submitted — your plan activates once the platform approves it"); setPending(null); setProof({ url: "", ref: "" }); qc.invalidateQueries({ queryKey: ["billing"] }); },
    onError: toastErr,
  });
  const cancel = useMutation({ mutationFn: () => apiPost<{ message: string }>("/admin/billing/cancel"), onSuccess: (r) => toast(r.message), onError: toastErr });
  if (b.isError) return <ErrorState onRetry={() => b.refetch()} />;
  if (!b.data) return <Skeleton className="h-64" />;
  const { org, plan, plans, invoices, seats_used } = b.data;
  const s = seats ?? org.seats;
  return (
    <div>
      <PageHeader title="Subscription & billing" subtitle="Seat-based pricing in ₹. Pay via UPI QR, upload the screenshot, and your plan activates after approval." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="brand" label="Current plan" value={plan.name} hint={`${org.billing_cycle} · ${org.status}`} testid="billing-current-plan" />
        <StatCard label="Seats" value={`${seats_used}/${org.seats}`} hint="active employees / purchased" testid="billing-seats" />
        <StatCard label="Next invoice" value={money(org.billing_cycle === "monthly" ? plan.price_monthly : plan.price_yearly)} hint="example pricing" />
        <StatCard label="Failed payments" value={invoices.filter((i) => i.status === "failed").length} tone="danger" hint="7-day grace period applies" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border p-0.5">{(["monthly", "yearly"] as const).map((c) => <Button key={c} size="sm" variant={cycle === c ? "secondary" : "ghost"} onClick={() => setCycle(c)} data-testid={`billing-cycle-${c}`}>{c}</Button>)}</div>
        <div className="flex items-center gap-2 text-sm"><Label>Seats</Label><Input type="number" min={1} className="w-24" value={s} onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))} data-testid="billing-seats-input" /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <div key={p.id} className={cn("lift flex flex-col rounded-2xl border bg-card p-5", p.id === org.plan_id && "border-primary ring-2 ring-primary/20")} data-testid="plan-card">
            <p className="font-heading text-lg font-bold">{p.name}</p>
            <p className="mt-2 font-heading text-3xl font-extrabold">{money(cycle === "monthly" ? p.price_monthly : p.price_yearly)}<span className="text-sm font-normal text-muted-foreground">/{cycle === "monthly" ? "mo" : "yr"}</span></p>
            <p className="text-xs text-muted-foreground">{p.seats} seats included</p>
            <ul className="my-4 flex-1 space-y-1.5 text-sm">{p.features.map((x) => <li key={x} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-success" />{x}</li>)}</ul>
            <Button variant={p.id === org.plan_id ? "outline" : "default"} onClick={() => change.mutate(p.id)} disabled={change.isPending} data-testid="plan-select-button">{p.id === org.plan_id ? "Update seats / cycle" : "Switch to " + p.name}</Button>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b p-4"><p className="font-heading font-semibold">Invoices & payment history</p><Button size="sm" variant="ghost" onClick={() => cancel.mutate()} data-testid="billing-cancel-button">Cancel at period end</Button></div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Plan</TableHead><TableHead>Seats</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {invoices.map((i) => (
              <TableRow key={i.id} data-testid="invoice-row"><TableCell>{dateTime(i.date)}</TableCell><TableCell>{i.plan_name} · {i.cycle}</TableCell><TableCell>{i.seats}</TableCell><TableCell className="text-right">{money(i.amount)}</TableCell><TableCell><StatusBadge status={i.status} testid="invoice-status-badge" /></TableCell>
                <TableCell>{(i.status === "pending" || i.status === "rejected") && <Button size="xs" variant="outline" onClick={() => setPending(i)} data-testid="invoice-pay-button">Pay now</Button>}{i.screenshot_url && <a href={i.screenshot_url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-primary underline">Screenshot</a>}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent data-testid="checkout-dialog">
          <DialogHeader><DialogTitle>Pay {pending && money(pending.amount)} via UPI</DialogTitle>
            <DialogDescription>{pending?.plan_name} · {pending?.cycle} · {pending?.seats} seats. Scan the QR, pay, then upload the payment screenshot.</DialogDescription></DialogHeader>
          {b.data.payment_qr_url ? <img src={b.data.payment_qr_url} alt="Payment QR" className="mx-auto h-56 w-56 rounded-xl border object-contain" data-testid="payment-qr-image" /> : <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700" data-testid="payment-qr-missing">The platform hasn't uploaded a payment QR yet.</p>}
          {b.data.upi_id && <p className="text-center text-sm">UPI ID: <b className="font-mono" data-testid="payment-upi-id">{b.data.upi_id}</b></p>}
          <div className="space-y-2">
            <Label>Payment screenshot</Label><ImageInput value={proof.url} onChange={(u) => setProof({ ...proof, url: u })} testid="payment-screenshot" />
            <Input placeholder="UPI transaction ID (optional)" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} data-testid="payment-reference-input" />
          </div>
          <DialogFooter><Button disabled={!proof.url || hook.isPending} onClick={() => pending && hook.mutate(pending.id)} data-testid="payment-submit-button">Submit for approval</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
