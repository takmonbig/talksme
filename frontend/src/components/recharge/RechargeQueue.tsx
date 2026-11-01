import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Eye, EyeOff, KeyRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/common";
import { apiGet, apiPost } from "@/lib/api";
import { money, timeAgo, toastErr, useMe } from "@/lib/hooks";
import { onRealtime } from "@/lib/realtime";
import type { RechargeRequest, RechargeSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const REASONS = ["Payment not received", "Amount doesn't match", "Screenshot is unclear or edited", "Duplicate screenshot"];

/** Employee/Admin: verify recharge payments, then deliver the platform ID + password (or reject with a reason). */
export function RechargeQueuePage() {
  const qc = useQueryClient();
  const me = useMe();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const list = useQuery({ queryKey: ["recharges", status], queryFn: () => apiGet<RechargeRequest[]>(`/recharge/requests?status=${status}`), refetchInterval: 20_000 });
  const sum = useQuery({ queryKey: ["recharges", "summary"], queryFn: () => apiGet<RechargeSummary>("/recharge/summary"), refetchInterval: 30_000 });
  useEffect(() => onRealtime((e) => { if (e.type === "recharge") qc.invalidateQueries({ queryKey: ["recharges"] }); }), [qc]);
  const [approve, setApprove] = useState<RechargeRequest | null>(null);
  const [reject, setReject] = useState<RechargeRequest | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const s = sum.data;
  return (
    <div>
      <PageHeader title="Recharge requests" subtitle="Check the payment screenshot against your UPI app, then send the customer their ID & password." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Waiting to verify", s?.pending ?? "–", true], ["Verified today", s?.approved_today ?? "–", false], ["Today's amount", s ? money(s.approved_today_amount) : "–", false], ["All-time verified", s ? money(s.approved_total_amount) : "–", false]].map(([l, v, hot]) => (
          <div key={l as string} className={cn("rounded-2xl border bg-card p-4", hot && Number(s?.pending) > 0 && "border-orange-400/60 bg-orange-500/5")} data-testid="recharge-stat">
            <p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <TabsList className="mb-3" data-testid="recharge-status-tabs">
          <TabsTrigger value="pending" data-testid="recharge-tab-pending">Pending</TabsTrigger><TabsTrigger value="approved" data-testid="recharge-tab-approved">Verified</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="recharge-tab-rejected">Rejected</TabsTrigger><TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      {list.isLoading ? <Skeleton className="h-40" /> : list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data?.length ? (
        <EmptyState title={status === "pending" ? "No payments waiting 🎉" : "Nothing here yet"} text="New recharge requests appear here instantly, with a sound alert." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-shadow duration-200 hover:shadow-md" data-testid="recharge-card">
              <button onClick={() => setShot(r.screenshot_url)} className="group relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted" data-testid="recharge-screenshot-button">
                <img src={r.screenshot_url} alt="Payment screenshot" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] text-white">View</span>
              </button>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold" data-testid="recharge-customer">{r.customer_name}</p>
                  <StatusPill s={r.status} />
                </div>
                <p className="text-xs text-muted-foreground">{r.customer_phone} · {timeAgo(r.created_at)}</p>
                <p><b className="text-lg" data-testid="recharge-amount">{money(r.amount)}</b> <span className="text-xs text-muted-foreground">for {r.service_name}</span></p>
                <p className="text-xs">Bonus {r.bonus_pct}% = {money(r.bonus_amount)} · <b>Give {money(r.total_credit)}</b></p>
                {r.utr && <p className="text-xs">UTR: <span className="font-mono">{r.utr}</span></p>}
                <p className="text-[11px] text-muted-foreground">{r.employee_id === me.data?.id ? "🙋 Assigned to you" : r.employee_name ? `Assigned: ${r.employee_name}` : "Shared queue"}{r.handled_by_name && ` · handled by ${r.handled_by_name}`}</p>
                {r.status === "rejected" && <p className="text-xs text-destructive">Reason: {r.reject_reason}</p>}
                {r.status === "approved" && r.credentials && <p className="text-xs">ID sent: <span className="font-mono">{r.credentials.username}</span></p>}
                {r.status === "pending" && (
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setApprove(r)} data-testid="recharge-approve-button"><CheckCircle2 className="h-3.5 w-3.5" /> Verify & send ID</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setReject(r)} data-testid="recharge-reject-button"><XCircle className="h-3.5 w-3.5" /> Reject</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!shot} onOpenChange={(o) => !o && setShot(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" data-testid="recharge-screenshot-dialog">{shot && <img src={shot} alt="Payment screenshot" className="w-full rounded-xl" />}</DialogContent>
      </Dialog>
      {approve && <ApproveDialog r={approve} onClose={() => setApprove(null)} />}
      {reject && <RejectDialog r={reject} onClose={() => setReject(null)} />}
    </div>
  );
}

export function StatusPill({ s }: { s: RechargeRequest["status"] }) {
  const m = { pending: ["Verifying", "bg-amber-500/15 text-amber-700 dark:text-amber-300", Clock], approved: ["Verified", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", CheckCircle2], rejected: ["Rejected", "bg-destructive/10 text-destructive", XCircle] } as const;
  const [label, cls, Icon] = m[s];
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)} data-testid="recharge-status"><Icon className="h-3 w-3" />{label}</span>;
}

function ApproveDialog({ r, onClose }: { r: RechargeRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ username: "", password: "", note: "" });
  const [show, setShow] = useState(true);
  const m = useMutation({
    mutationFn: () => apiPost<RechargeRequest>(`/recharge/requests/${r.id}/approve`, f),
    onSuccess: () => { toast.success(`Verified. ${r.customer_name} can see their ID now`); qc.invalidateQueries({ queryKey: ["recharges"] }); qc.invalidateQueries({ queryKey: ["deposits"] }); onClose(); },
    onError: (e) => { toastErr(e); qc.invalidateQueries({ queryKey: ["recharges"] }); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="recharge-approve-dialog">
        <DialogHeader><DialogTitle>Verify {money(r.amount)} · {r.service_name}</DialogTitle><DialogDescription>Only verify after the money shows in your UPI app. The customer sees this ID & password in My Services, and it's added to the deposit ledger.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{r.service_name} username / ID</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} data-testid="recharge-username-input" /></div>
          <div className="space-y-1"><Label>Password</Label>
            <div className="flex gap-1"><Input type={show ? "text" : "password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="recharge-password-input" /><Button variant="ghost" size="icon" onClick={() => setShow(!show)} aria-label="Show password">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div>
          </div>
          <div className="space-y-1"><Label>Note for the customer <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={`Balance ₹${r.total_credit} added. Enjoy!`} data-testid="recharge-note-input" /></div>
        </div>
        <DialogFooter><Button disabled={!f.username.trim() || !f.password.trim() || m.isPending} onClick={() => m.mutate()} data-testid="recharge-approve-submit"><KeyRound className="h-4 w-4" /> {m.isPending ? "Sending…" : "Verify & send"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ r, onClose }: { r: RechargeRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<RechargeRequest>(`/recharge/requests/${r.id}/reject`, { reason }),
    onSuccess: () => { toast.success("Rejected. The customer has been told why"); qc.invalidateQueries({ queryKey: ["recharges"] }); onClose(); },
    onError: (e) => { toastErr(e); qc.invalidateQueries({ queryKey: ["recharges"] }); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="recharge-reject-dialog">
        <DialogHeader><DialogTitle>Reject {money(r.amount)} payment</DialogTitle><DialogDescription>The customer sees "Your request is rejected due to …" in their dashboard and chat.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-1.5">{REASONS.map((x) => <Button key={x} size="xs" variant={reason === x ? "default" : "outline"} onClick={() => setReason(x)} data-testid="recharge-reason-chip">{x}</Button>)}</div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="Reason" data-testid="recharge-reason-input" />
        <DialogFooter><Button variant="destructive" disabled={reason.trim().length < 3 || m.isPending} onClick={() => m.mutate()} data-testid="recharge-reject-submit">{m.isPending ? "Rejecting…" : "Reject payment"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
