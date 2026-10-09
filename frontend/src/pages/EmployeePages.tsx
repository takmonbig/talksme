import { useState } from "react";
import { AutoMessagesCard } from "@/components/AutoMessagesCard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, MockBadge, PageHeader, StatusBadge, VerifiedBadge } from "@/components/common";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import { AnalyticsView, CustomersView, DepositsView } from "@/components/crm/Views";
import { apiGet, apiPatch } from "@/lib/api";
import { dateTime, toastErr, useMe } from "@/lib/hooks";
import { ImageInput } from "@/lib/media";
import { ChangePassword } from "@/pages/AdminPages";
import type { Transfer, User } from "@/lib/types";

function MyTransfers() {
  const t = useQuery({ queryKey: ["transfers"], queryFn: () => apiGet<Transfer[]>("/transfers") });
  if (!t.data?.length) return null;
  return (
    <div className="mb-6 rounded-2xl border bg-card p-4" data-testid="my-transfers">
      <p className="mb-2 font-heading font-semibold">My transfer requests</p>
      <div className="divide-y">
        {t.data.slice(0, 5).map((x) => (
          <div key={x.id} className="flex items-center gap-2 py-2 text-sm"><span className="font-medium">{x.customer_name}</span><span className="text-muted-foreground">→ {x.to_employee_name}</span><span className="ml-auto text-xs text-muted-foreground">{dateTime(x.created_at)}</span><StatusBadge status={x.status} testid="transfer-status-badge" /></div>
        ))}
      </div>
    </div>
  );
}

export function EmployeeDashboard() {
  const me = useMe();
  return <AnalyticsView endpoint="/analytics" title={`Good to see you, ${me.data?.name.split(" ")[0] ?? ""}`} subtitle="Your assigned conversations, customers and recorded deposits." showEmployees extra={<MyTransfers />} />;
}
export const EmployeeInbox = () => <InboxWorkspace mode="employee" />;
export const EmployeeCustomers = () => <CustomersView />;
export const EmployeeDeposits = () => <DepositsView />;
export const EmployeeAnalytics = () => <AnalyticsView endpoint="/analytics" title="My analytics" subtitle="Performance against your admin-defined target." />;

export function EmployeeSettings() {
  const qc = useQueryClient();
  const me = useMe();
  const u = me.data;
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (b: Partial<User>) => apiPatch<User>("/auth/me", b),
    onSuccess: (x) => { qc.setQueryData(["me"], x); qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Preferences saved"); },
    onError: toastErr,
  });
  if (!u) return null;
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Your profile, availability and notification preferences." />
      <div className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-4"><Avatar name={u.name} src={avatar ?? u.avatar} size={64} status={u.status} /><div><p className="font-heading text-lg font-semibold">{u.name}</p><p className="text-sm text-muted-foreground">{u.title}</p>{u.verified ? <VerifiedBadge /> : <span className="text-xs text-muted-foreground">Verification pending admin approval</span>}</div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Display name</Label><Input value={name ?? u.name} onChange={(e) => setName(e.target.value)} data-testid="settings-name-input" /></div>
            <div className="space-y-1"><Label>Avatar URL</Label><ImageInput value={avatar ?? u.avatar} onChange={(v) => setAvatar(v)} testid="settings-avatar" /></div>
          </div>
          <Button className="mt-4" disabled={m.isPending || (name ?? u.name).trim().length < 2} onClick={() => m.mutate({ name: name ?? u.name, avatar: avatar ?? u.avatar })} data-testid="settings-save-profile">Save profile</Button>
        </div>
        <AutoMessagesCard />
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-semibold">Availability</p><p className="text-xs text-muted-foreground">Offline employees are skipped by round-robin and least-busy routing.</p></div>
            <Select value={u.status} onValueChange={(v: string) => m.mutate({ status: v })}>
              <SelectTrigger className="w-32" data-testid="settings-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{["online", "away", "offline"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={u.calls_enabled} onCheckedChange={(v) => m.mutate({ calls_enabled: !!v })} data-testid="settings-calls-checkbox" /> Accept incoming audio calls</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={u.notify_sound} onCheckedChange={(v) => m.mutate({ notify_sound: !!v })} data-testid="settings-sound-checkbox" /> Sound for new messages</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={u.notify_push} onCheckedChange={(v) => m.mutate({ notify_push: !!v })} data-testid="settings-push-checkbox" /> Browser notifications</label>
        </div>
        <ChangePassword />
      </div>
    </div>
  );
}
