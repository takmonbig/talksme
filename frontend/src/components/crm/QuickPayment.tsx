import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPatch, apiPost } from "@/lib/api";
import { money, toastErr } from "@/lib/hooks";
import type { CustomerProfile, Deposit } from "@/lib/types";
import { STAGES, invalidateCrm } from "@/components/crm/CustomerPanel";

const METHODS = ["UPI", "Bank Transfer", "Cash", "Card", "Wallet", "Other"] as const;
const today = () => new Date().toISOString().slice(0, 10);

/** One simple form: customer details + payment received. Saves details, then records an employee-reported deposit. */
export function QuickPayment({ p }: { p: CustomerProfile }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: p.name, phone: p.phone, stage: p.stage, amount: "", date: today(), method: "UPI", note: "" });
  useEffect(() => { setF((x) => ({ ...x, name: p.name, phone: p.phone, stage: p.stage })); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const amt = Number(f.amount);
  const phoneOk = !f.phone || /^\+?\d{6,16}$/.test(f.phone.replace(/\s/g, ""));
  const m = useMutation({
    mutationFn: async () => {
      const det: Record<string, string> = {};
      if (f.name.trim() && f.name.trim() !== p.name) det.name = f.name.trim();
      if (f.phone.replace(/\s/g, "") !== p.phone && f.phone) det.phone = f.phone.replace(/\s/g, "");
      if (f.stage !== p.stage) det.stage = f.stage;
      if (Object.keys(det).length) await apiPatch(`/customers/${p.id}`, det);
      if (amt > 0) return apiPost<Deposit>("/deposits", { customer_id: p.id, amount: amt, currency: "INR", method: f.method, payment_date: f.date, notes: f.note, product: "Payment" });
      return null;
    },
    onSuccess: (d) => { toast.success(d ? `${money(d.amount)} recorded for ${f.name}. Pending admin review` : "Customer details saved"); invalidateCrm(qc); setF((x) => ({ ...x, amount: "", note: "" })); },
    onError: toastErr,
  });
  return (
    <form className="space-y-2.5 rounded-xl border bg-muted/20 p-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }} data-testid="quick-payment-form">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><IndianRupee className="h-4 w-4 text-emerald-600" /> Customer & payment</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label className="text-[11px]">Customer name</Label><Input className="h-8" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="qp-name" /></div>
        <div className="space-y-1"><Label className="text-[11px]">WhatsApp number</Label><Input className="h-8" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91…" data-testid="qp-phone" /></div>
        <div className="col-span-2 space-y-1"><Label className="text-[11px]">Customer label</Label>
          <Select value={f.stage} onValueChange={(v: string) => setF({ ...f, stage: v })}><SelectTrigger className="h-8 w-full" data-testid="qp-stage"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1"><Label className="text-[11px]">Amount received (₹)</Label><Input className="h-8" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" data-testid="qp-amount" /></div>
        <div className="space-y-1"><Label className="text-[11px]">Payment date</Label><Input className="h-8" type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="qp-date" /></div>
        <div className="space-y-1"><Label className="text-[11px]">Method</Label>
          <Select value={f.method} onValueChange={(v: string) => setF({ ...f, method: v })}><SelectTrigger className="h-8 w-full" data-testid="qp-method"><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1"><Label className="text-[11px]">Note (optional)</Label><Input className="h-8" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="qp-note" /></div>
      </div>
      {!phoneOk && <p className="text-xs text-destructive">Enter a valid number</p>}
      <Button type="submit" className="w-full" disabled={m.isPending || !phoneOk || !f.name.trim() || (!!f.amount && !(amt > 0))} data-testid="qp-save">{m.isPending ? "Saving…" : amt > 0 ? `Save & record ${money(amt)}` : "Save"}</Button>
      <p className="text-[10px] text-muted-foreground">Payments are employee-reported records, not verified bank receipts. Admin can review, dispute or reverse them.</p>
    </form>
  );
}
