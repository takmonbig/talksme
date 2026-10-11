import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CalendarClock, History, Plus, Shuffle, StickyNote, Unlock, Wallet, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, Skeleton, StatusBadge } from "@/components/common";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { uploadFile } from "@/lib/media";
import { dateTime, money, toastErr } from "@/lib/hooks";
import type { CustomerProfile, Deposit, EmployeeStat, Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";

export const STAGES = ["New Lead", "Interested", "Hot Lead", "Converted", "VIP", "Frequent Customer", "Inactive", "Blocked"];
const QUICK_LABELS = ["VIP", "Hot Lead", "Repeat", "Follow-up", "Price sensitive", "Callback"];

export function invalidateCrm(qc: ReturnType<typeof useQueryClient>) {
  ["customers", "customer", "conversations", "deposits", "analytics", "transfers"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function DepositDialog({ open, onOpenChange, customers, presetCustomer }: {
  open: boolean; onOpenChange: (o: boolean) => void; customers?: CustomerProfile[]; presetCustomer?: CustomerProfile;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const blank = { customer_id: presetCustomer?.id ?? "", amount: "", currency: "INR", product: "", method: "UPI", reference: "", payment_date: today, notes: "", proof_name: "" };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof blank, v: string) => setF((s) => ({ ...s, [k]: v }));
  const m = useMutation({
    mutationFn: () => apiPost<Deposit>("/deposits", { ...f, amount: Number(f.amount) }),
    onSuccess: (d) => { toast.success(`Deposit of ${money(d.amount, d.currency)} recorded — pending admin review`); invalidateCrm(qc); onOpenChange(false); setF(blank); },
    onError: toastErr,
  });
  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.customer_id) e.customer_id = "Select a customer";
    if (!(Number(f.amount) > 0)) e.amount = "Enter an amount greater than 0";
    if (f.product.trim().length < 2) e.product = "Product / service is required";
    if (f.reference.trim().length < 3) e.reference = "Transaction reference is required";
    if (f.payment_date > today) e.payment_date = "Payment date can't be in the future";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const list = presetCustomer ? [presetCustomer] : customers ?? [];
  const field = (k: string) => errors[k] && <p className="text-xs text-destructive" data-testid={`deposit-error-${k}`}>{errors[k]}</p>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="deposit-dialog">
        <DialogHeader>
          <DialogTitle>Record a deposit</DialogTitle>
          <DialogDescription>Manual entry. It counts in provisional totals immediately but is not a confirmed bank receipt until an admin reviews it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Customer</Label>
            <Select value={f.customer_id} onValueChange={(v: string) => set("customer_id", v)}>
              <SelectTrigger className="w-full" data-testid="deposit-customer-select"><SelectValue>{(v) => list.find((c) => c.id === v)?.name ?? "Select customer"}</SelectValue></SelectTrigger>
              <SelectContent>{list.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.phone}</SelectItem>)}</SelectContent>
            </Select>
            {field("customer_id")}
          </div>
          <div className="space-y-1"><Label>Amount</Label><Input type="number" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} data-testid="deposit-amount-input" />{field("amount")}</div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Select value={f.currency} onValueChange={(v: string) => set("currency", v)}>
              <SelectTrigger className="w-full" data-testid="deposit-currency-select"><SelectValue /></SelectTrigger>
              <SelectContent>{["INR", "USD", "EUR", "AED", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1"><Label>Product / service</Label><Input value={f.product} onChange={(e) => set("product", e.target.value)} data-testid="deposit-product-input" />{field("product")}</div>
          <div className="space-y-1">
            <Label>Payment method</Label>
            <Select value={f.method} onValueChange={(v: string) => set("method", v)}>
              <SelectTrigger className="w-full" data-testid="deposit-method-select"><SelectValue /></SelectTrigger>
              <SelectContent>{["UPI", "Bank Transfer", "Card", "Cash", "Wallet", "Other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Payment date</Label><Input type="date" max={today} value={f.payment_date} onChange={(e) => set("payment_date", e.target.value)} data-testid="deposit-date-input" />{field("payment_date")}</div>
          <div className="col-span-2 space-y-1"><Label>Transaction reference</Label><Input value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="e.g. UPI ref / UTR" data-testid="deposit-reference-input" />{field("reference")}</div>
          <div className="col-span-2 space-y-1">
            <Label>Proof attachment (optional)</Label>
            <Input type="file" accept="image/*,.pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { set("proof_name", (await uploadFile(file)).url); toast.success("Proof uploaded"); } catch (err) { toast.error((err as Error).message); } }} data-testid="deposit-proof-input" />{f.proof_name && <a href={f.proof_name} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View uploaded proof</a>}
          </div>
          <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} data-testid="deposit-notes-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="deposit-cancel-button">Cancel</Button>
          <Button onClick={() => validate() && m.mutate()} disabled={m.isPending} data-testid="deposit-submit-button">{m.isPending ? "Saving…" : "Record deposit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onOpenChange, conversationId, currentEmployeeId }: { open: boolean; onOpenChange: (o: boolean) => void; conversationId: string; currentEmployeeId: string | null }) {
  const qc = useQueryClient();
  const emps = useQuery({ queryKey: ["employees"], queryFn: () => apiGet<EmployeeStat[]>("/employees"), enabled: open });
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<Transfer>(`/conversations/${conversationId}/transfer`, { to_employee_id: to, reason }),
    onSuccess: (t) => { toast.success(`Transfer to ${t.to_employee_name} requested — awaiting admin approval`); qc.invalidateQueries({ queryKey: ["transfers"] }); onOpenChange(false); setReason(""); },
    onError: toastErr,
  });
  const options = (emps.data ?? []).filter((e) => e.id !== currentEmployeeId && e.active);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="transfer-dialog">
        <DialogHeader><DialogTitle>Request conversation transfer</DialogTitle><DialogDescription>Transfers require admin approval and are recorded in the audit log.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Transfer to</Label>
            <Select value={to} onValueChange={(v: string) => setTo(v)}>
              <SelectTrigger className="w-full" data-testid="transfer-employee-select"><SelectValue>{(v) => options.find((e) => e.id === v)?.name ?? "Choose employee"}</SelectValue></SelectTrigger>
              <SelectContent>{options.map((e) => <SelectItem key={e.id} value={e.id} data-testid="transfer-employee-option">{e.name} · {e.status}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this customer move?" data-testid="transfer-reason-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!to || reason.trim().length < 3 || m.isPending} onClick={() => m.mutate()} data-testid="transfer-submit-button">Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Customer 360° drawer used in the inbox right pane. */
export function CustomerPanel({ customerId, conversationId, employeeId, canTransfer }: { customerId: string; conversationId?: string; employeeId?: string | null; canTransfer?: boolean }) {
  const qc = useQueryClient();
  const c = useQuery({ queryKey: ["customer", customerId], queryFn: () => apiGet<CustomerProfile>(`/customers/${customerId}`) });
  const deps = useQuery({ queryKey: ["deposits", "customer", customerId], queryFn: () => apiGet<Deposit[]>(`/deposits?customer_id=${customerId}`) });
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("");
  const [fu, setFu] = useState({ title: "", due: "" });
  const [depOpen, setDepOpen] = useState(false);
  const [trOpen, setTrOpen] = useState(false);
  const onDone = (p: CustomerProfile) => { qc.setQueryData(["customer", customerId], p); invalidateCrm(qc); };
  const patch = useMutation({ mutationFn: (b: Partial<CustomerProfile>) => apiPatch<CustomerProfile>(`/customers/${customerId}`, b), onSuccess: (p) => { onDone(p); toast.success("Customer updated"); }, onError: toastErr });
  const addNote = useMutation({ mutationFn: () => apiPost<CustomerProfile>(`/customers/${customerId}/notes`, { text: note }), onSuccess: (p) => { onDone(p); setNote(""); toast.success("Note added"); }, onError: toastErr });
  const addFu = useMutation({ mutationFn: () => apiPost<CustomerProfile>(`/customers/${customerId}/followups`, fu), onSuccess: (p) => { onDone(p); setFu({ title: "", due: "" }); toast.success("Follow-up scheduled"); }, onError: toastErr });
  const toggleFu = useMutation({ mutationFn: (x: { id: string; done: boolean }) => apiPatch<CustomerProfile>(`/customers/${customerId}/followups/${x.id}`, { done: x.done }), onSuccess: onDone, onError: toastErr });

  if (c.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-16" /><Skeleton className="h-32" /></div>;
  if (!c.data) return <p className="p-4 text-sm text-muted-foreground">Customer details unavailable.</p>;
  const p = c.data;
  const sum = (s: string) => (deps.data ?? []).filter((d) => d.status === s).reduce((a, d) => a + d.amount, 0);

  return (
    <div className="space-y-5 p-4 text-sm" data-testid="customer-panel">
      <div className="flex flex-col items-center text-center">
        <Avatar name={p.name} size={64} />
        <p className="mt-2 font-heading text-base font-semibold" data-testid="customer-panel-name">{p.name}</p>
        <p className="text-xs text-muted-foreground" data-testid="customer-panel-phone">{p.phone ? <>{p.phone} · <span className="italic">not WhatsApp-verified</span></> : <span className="italic">Guest · no WhatsApp number shared yet</span>}</p>
        <p className="mt-1 text-xs text-muted-foreground">Assigned: {p.assigned_employee_name || "Queue"}</p>
        {p.blocked && <span className="mt-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive" data-testid="customer-blocked-badge">Blocked</span>}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5" data-testid="customer-calls-allowed-row">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium"><Phone className="h-3.5 w-3.5 text-primary" /> Customer can call me</span>
          <span className="block text-[11px] text-muted-foreground">{p.calls_allowed === false ? "Off: their call button is hidden. You can still call them." : "On: they can start voice calls with you."}</span>
        </span>
        <Switch checked={p.calls_allowed !== false} onCheckedChange={(v) => patch.mutate({ calls_allowed: v })} data-testid="customer-calls-allowed-switch" />
      </label>

      <section className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Lead stage</Label>
        <Select value={p.stage} onValueChange={(v: string) => patch.mutate({ stage: v })}>
          <SelectTrigger className="w-full" data-testid="customer-stage-select"><SelectValue /></SelectTrigger>
          <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s} data-testid="customer-stage-option">{s}</SelectItem>)}</SelectContent>
        </Select>
      </section>

      <section className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Labels</Label>
        <div className="flex flex-wrap gap-1.5" data-testid="customer-labels">
          {p.labels.map((l) => (
            <button key={l} onClick={() => patch.mutate({ labels: p.labels.filter((x) => x !== l) })} className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Remove label" data-testid="customer-label-chip">{l} ×</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_LABELS.filter((l) => !p.labels.includes(l)).map((l) => (
            <button key={l} onClick={() => patch.mutate({ labels: [...p.labels, l] })} className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary" data-testid={`customer-add-label-${l.toLowerCase().replace(/\s+/g, "-")}`}>+ {l}</button>
          ))}
        </div>
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (label.trim()) { patch.mutate({ labels: [...p.labels, label.trim()] }); setLabel(""); } }}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Custom label" className="h-8" data-testid="customer-label-input" />
          <Button size="sm" type="submit" variant="outline" data-testid="customer-label-add-button"><Plus className="h-3.5 w-3.5" /></Button>
        </form>
      </section>

      <section className="rounded-xl border p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 font-semibold"><Wallet className="h-4 w-4 text-primary" /> Deposits</p>
          <Button size="xs" onClick={() => setDepOpen(true)} disabled={p.blocked} data-testid="panel-record-deposit-button"><Plus className="h-3 w-3" /> Record</Button>
        </div>
        <p className="mt-2 font-heading text-xl font-bold" data-testid="customer-deposit-total">{money(p.total_deposits)}</p>
        <p className="text-[11px] text-muted-foreground">Provisional total (excludes reversed) · {p.deposit_count} payments</p>
        <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
          <div className="rounded bg-emerald-500/10 p-1.5"><p className="opacity-70">Recorded</p><b>{money(sum("Recorded"))}</b></div>
          <div className="rounded bg-blue-500/10 p-1.5"><p className="opacity-70">Reviewed</p><b>{money(sum("Reviewed"))}</b></div>
          <div className="rounded bg-red-500/10 p-1.5"><p className="opacity-70">Disputed</p><b>{money(sum("Disputed"))}</b></div>
        </div>
        <div className="mt-2 space-y-1">
          {(deps.data ?? []).slice(0, 3).map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs"><span className="truncate">{d.product}</span><span className="flex items-center gap-1">{money(d.amount, d.currency)} <StatusBadge status={d.status} /></span></div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Follow-ups</p>
        {p.follow_ups.map((f) => (
          <label key={f.id} className="flex items-center gap-2 text-xs" data-testid="followup-item">
            <Checkbox checked={f.done} onCheckedChange={(v) => toggleFu.mutate({ id: f.id, done: !!v })} data-testid="followup-checkbox" />
            <span className={cn(f.done && "line-through opacity-60")}>{f.title}</span><span className="ml-auto text-muted-foreground">{f.due}</span>
          </label>
        ))}
        <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); if (fu.title && fu.due) addFu.mutate(); else toast.error("Add a title and due date"); }}>
          <Input value={fu.title} onChange={(e) => setFu({ ...fu, title: e.target.value })} placeholder="e.g. Call back about EMI" className="h-8" data-testid="followup-title-input" />
          <div className="flex gap-1">
            <Input type="date" value={fu.due} onChange={(e) => setFu({ ...fu, due: e.target.value })} className="h-8" data-testid="followup-date-input" />
            <Button size="sm" type="submit" variant="outline" data-testid="followup-add-button">Add</Button>
          </div>
        </form>
      </section>

      <section className="space-y-2">
        <p className="flex items-center gap-1.5 font-semibold"><StickyNote className="h-4 w-4 text-primary" /> Internal notes</p>
        <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }} className="space-y-1">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Only your team can see this" data-testid="note-input" />
          <Button size="sm" type="submit" className="w-full" disabled={!note.trim()} data-testid="note-add-button">Add note</Button>
        </form>
        {p.notes.map((n) => (
          <div key={n.id} className="rounded-lg bg-amber-500/10 p-2 text-xs" data-testid="note-item"><p>{n.text}</p><p className="mt-1 text-[10px] text-muted-foreground">{n.author_name} · {dateTime(n.created_at)}</p></div>
        ))}
      </section>

      <section className="flex flex-col gap-2 border-t pt-4">
        {canTransfer && conversationId && (
          <Button variant="outline" size="sm" onClick={() => setTrOpen(true)} data-testid="request-transfer-button"><Shuffle className="h-4 w-4" /> Request transfer</Button>
        )}
        <Button variant={p.blocked ? "outline" : "destructive"} size="sm" onClick={() => patch.mutate({ blocked: !p.blocked })} data-testid="customer-block-toggle">
          {p.blocked ? <><Unlock className="h-4 w-4" /> Unblock customer</> : <><Ban className="h-4 w-4" /> Block customer</>}
        </Button>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><History className="h-3 w-3" /> Customer since {dateTime(p.created_at)}</p>
      </section>

      <DepositDialog open={depOpen} onOpenChange={setDepOpen} presetCustomer={p} />
      {conversationId && <TransferDialog open={trOpen} onOpenChange={setTrOpen} conversationId={conversationId} currentEmployeeId={employeeId ?? null} />}
    </div>
  );
}
