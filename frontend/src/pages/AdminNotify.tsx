import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Pager, SkeletonGrid, StatusBadge, useTable } from "@/components/common";
import { apiGet, apiPost } from "@/lib/api";
import { dateTime, toastErr } from "@/lib/hooks";
import type { CustomerProfile, NotificationRecord } from "@/lib/types";

const STATUS: Record<string, string> = { sent: "Delivered to device", no_device: "No device with notifications on", blocked_by_preferences: "Customer turned notifications off / blocked", failed: "Push service rejected" };

export function AdminNotifications() {
  const qc = useQueryClient();
  const custs = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<CustomerProfile[]>("/customers") });
  const hist = useQuery({ queryKey: ["admin-notifications"], queryFn: () => apiGet<NotificationRecord[]>("/admin/notifications") });
  const [q, setQ] = useState("");
  const [f, setF] = useState({ customer_id: "", title: "", body: "", url: "" });
  const list = useMemo(() => (custs.data ?? []).filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [custs.data, q]);
  const pick = custs.data?.find((c) => c.id === f.customer_id);
  const urlOk = !f.url || /^(https:\/\/|\/)/.test(f.url);
  const send = useMutation({
    mutationFn: () => apiPost<NotificationRecord>("/admin/notifications", f),
    onSuccess: (r) => { (r.status === "sent" ? toast.success : toast.warning)(STATUS[r.status] ?? r.status); qc.invalidateQueries({ queryKey: ["admin-notifications"] }); setF({ ...f, title: "", body: "", url: "" }); },
    onError: toastErr,
  });
  const t = useTable(hist.data, { search: (r) => `${r.customer_name} ${r.title} ${r.status}`, pageSize: 10 });
  return (
    <div>
      <PageHeader title="Customer notifications" subtitle="Send a push notification to one customer. For opted-in audiences, use Broadcasts." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3 rounded-2xl border bg-card p-5" data-testid="notify-form">
          <Label>Customer</Label>
          {pick ? <p className="text-sm">To: <b data-testid="notify-selected">{pick.name}</b> <span className="text-muted-foreground">{pick.phone}</span> <button className="text-xs text-primary underline" onClick={() => setF({ ...f, customer_id: "" })}>change</button></p> : (
            <>
              <Input placeholder="Search customer name or phone" value={q} onChange={(e) => setQ(e.target.value)} data-testid="notify-customer-search" />
              <div className="rounded-xl border">{list.map((c) => <button key={c.id} onClick={() => setF({ ...f, customer_id: c.id })} className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted" data-testid="notify-customer-option">{c.name} <span className="text-xs text-muted-foreground">{c.phone || "guest"} · {c.stage}</span></button>)}</div>
            </>
          )}
          <div className="space-y-1"><Label>Title</Label><Input maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="notify-title" /></div>
          <div className="space-y-1"><Label>Message</Label><Textarea maxLength={300} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="notify-body" /></div>
          <div className="space-y-1"><Label>Link (optional)</Label><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… or /chat" data-testid="notify-url" />{!urlOk && <p className="text-xs text-destructive">Must start with https:// or /</p>}</div>
          <Button disabled={!f.customer_id || !f.title.trim() || !f.body.trim() || !urlOk || send.isPending} onClick={() => send.mutate()} data-testid="notify-send"><Send className="h-4 w-4" /> {send.isPending ? "Sending…" : "Send notification"}</Button>
        </div>
        <div className="rounded-2xl border bg-slate-900 p-5 text-white" data-testid="notify-preview">
          <p className="mb-3 text-xs uppercase tracking-wide text-white/60">Preview</p>
          <div className="flex gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500"><Bell className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{f.title || "Title"}</p><p className="line-clamp-3 text-xs text-white/80">{f.body || "Your message appears here"}</p></div></div>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border bg-card">
        <p className="border-b px-4 py-3 font-semibold">History</p>
        {hist.isLoading ? <div className="p-4"><SkeletonGrid n={2} /></div> : !t.total ? <EmptyState title="No notifications sent yet" /> : (
          <>
            <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Customer</TableHead><TableHead>Notification</TableHead><TableHead>Status</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
              <TableBody>{t.rows.map((r) => (
                <TableRow key={r.id} data-testid="notify-history-row"><TableCell className="text-xs">{dateTime(r.created_at)}</TableCell><TableCell>{r.customer_name}</TableCell>
                  <TableCell><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.body}</p></TableCell>
                  <TableCell><StatusBadge status={r.status === "sent" ? "delivered" : r.status} /><p className="text-[10px] text-muted-foreground">{STATUS[r.status]} · {r.delivered}/{r.devices} devices</p></TableCell><TableCell className="text-xs">{r.sent_by}</TableCell></TableRow>
              ))}</TableBody></Table>
            <Pager {...t} />
          </>
        )}
      </div>
    </div>
  );
}
