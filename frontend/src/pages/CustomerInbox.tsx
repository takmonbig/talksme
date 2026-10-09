import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Ban, BellOff, LogOut, MoreVertical, Search, Settings, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, EmptyState, Logo, Skeleton, ThemeToggle, VerifiedBadge } from "@/components/common";
import { ChatThread } from "@/components/chat/ChatThread";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { endSession } from "@/lib/session";
import { timeAgo, toastErr, useMe } from "@/lib/hooks";
import { useOnline } from "@/lib/pwa";
import { InstallBanner, InstallPill, NotifyBanner } from "@/components/AppBanners";
import type { Conversation, Ok, User } from "@/lib/types";
import { cn } from "@/lib/utils";

function PrefsDialog({ me, open, onOpenChange }: { me: User; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.name);
  const [sound, setSound] = useState(me.notify_sound);
  const [push, setPush] = useState(me.notify_push);
  const m = useMutation({
    mutationFn: () => apiPatch<User>("/auth/me", { name, notify_sound: sound, notify_push: push }),
    onSuccess: (u) => { qc.setQueryData(["me"], u); qc.invalidateQueries({ queryKey: ["conversations"] }); toast.success("Preferences saved"); onOpenChange(false); },
    onError: toastErr,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="customer-prefs-dialog">
        <DialogHeader><DialogTitle>Profile & notifications</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Profile name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="customer-name-input" /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={sound} onCheckedChange={(v) => setSound(!!v)} data-testid="pref-sound-checkbox" /> In-app sound for new messages</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={push} onCheckedChange={(v) => setPush(!!v)} data-testid="pref-push-checkbox" /> Push notifications on this phone (messages & calls)</label>
          <p className="text-xs text-muted-foreground">Delivery when the app is fully closed depends on your phone's battery settings.</p>
        </div>
        <DialogFooter><Button disabled={name.trim().length < 2 || m.isPending} onClick={() => m.mutate()} data-testid="customer-prefs-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ conv, open, onOpenChange }: { conv: Conversation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<Ok>(`/conversations/${conv.id}/report`, { reason: reason || "Unblock", block: !conv.blocked }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["conversation", conv.id] }); onOpenChange(false); },
    onError: toastErr,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="report-dialog">
        <DialogHeader><DialogTitle>{conv.blocked ? `Unblock ${conv.org_name}?` : `Block & report ${conv.org_name}`}</DialogTitle>
          <DialogDescription>{conv.blocked ? "You'll be able to message this business again." : "They won't be able to message you. Our trust team reviews every report."}</DialogDescription></DialogHeader>
        {!conv.blocked && <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened?" data-testid="report-reason-input" />}
        <DialogFooter><Button variant={conv.blocked ? "default" : "destructive"} disabled={(!conv.blocked && reason.trim().length < 3) || m.isPending} onClick={() => m.mutate()} data-testid="report-submit-button">{conv.blocked ? "Unblock" : "Block & report"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerInbox() {
  const { conversationId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const online = useOnline();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "archived">("all");
  const [prefs, setPrefs] = useState(false);
  const [report, setReport] = useState(false);
  const isCustomer = me.data?.role === "customer";
  const list = useQuery({
    queryKey: ["conversations", "customer", tab, q],
    queryFn: () => apiGet<Conversation[]>(`/conversations?filter=${tab}&q=${encodeURIComponent(q)}`),
    enabled: isCustomer, refetchInterval: 20000,
  });
  const active = useQuery({
    queryKey: ["conversation", conversationId], queryFn: () => apiGet<Conversation>(`/conversations/${conversationId}`),
    enabled: isCustomer && !!conversationId, refetchInterval: 4000, retry: false,
  });
  const patch = useMutation({
    mutationFn: (b: Record<string, boolean>) => apiPatch<Conversation>(`/conversations/${conversationId}`, b),
    onSuccess: (c) => { qc.setQueryData(["conversation", c.id], c); qc.invalidateQueries({ queryKey: ["conversations"] }); toast.success("Updated"); },
    onError: toastErr,
  });

  if (me.isLoading) return <div className="p-6"><Skeleton className="h-screen" /></div>;
  if (!me.data) return <Navigate to="/demo?next=/chat" replace />;
  if (!isCustomer) {
    return <div className="flex min-h-screen items-center justify-center p-6"><EmptyState title="Customer inbox" text="This universal inbox is for customers. Sign in with the customer demo account or start a chat from a landing page." action={<Button onClick={() => endSession("/demo")} data-testid="switch-to-customer-button">Switch account</Button>} /></div>;
  }
  const unreadTotal = (list.data ?? []).reduce((a, c) => a + c.unread, 0);
  const conv = active.data;

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {!online && <div className="flex items-center justify-center gap-2 bg-amber-500 py-1 text-xs font-semibold text-white" data-testid="offline-banner"><WifiOff className="h-3.5 w-3.5" /> You're offline — reconnecting…</div>}
      <div className="flex min-h-0 flex-1">
        <aside className={cn("flex w-full shrink-0 flex-col border-r bg-card md:w-96", conversationId && "hidden md:flex")}>
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Logo compact />
            <div className="min-w-0 flex-1"><p className="font-heading text-lg font-bold leading-tight">Chats {unreadTotal > 0 && <span className="bg-brand ml-1 rounded-full px-2 text-xs text-white" data-testid="customer-unread-total">{unreadTotal}</span>}</p><p className="truncate text-[11px] text-muted-foreground">One inbox for every business · {me.data.name}{me.data.guest && " (guest)"}</p></div>
            <InstallPill />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" data-testid="customer-menu-button" />}><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setPrefs(true)} data-testid="customer-menu-prefs"><Settings className="h-4 w-4" />Profile & notifications</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => endSession("/demo")} data-testid="customer-menu-logout"><LogOut className="h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <InstallBanner testid="install-app-banner-list" />
          <NotifyBanner who="customer" className="mt-1" />
          <div className="space-y-2 p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="pl-9" data-testid="customer-search-input" /></div>
            <div className="flex gap-1">
              {(["all", "unread", "archived"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} data-testid={`customer-tab-${t}`} className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors", tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{t}</button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="customer-conversation-list">
            {list.isLoading && <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
            {list.data?.length === 0 && <div className="p-4"><EmptyState title="No chats yet" text="Open any business's talksme.in page to start chatting." action={<Link to="/p/talksme/support"><Button size="sm" data-testid="open-demo-business-button">Open a demo business</Button></Link>} /></div>}
            {list.data?.map((c) => (
              <button key={c.id} onClick={() => nav(`/chat/${c.id}`)} data-testid="customer-conversation-item"
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/60", c.id === conversationId && "bg-accent")}>
                <div className="relative"><Avatar name={c.org_name} src={c.employee_avatar} size={48} status={c.employee_status} /></div>
                <div className="min-w-0 flex-1 border-b pb-3">
                  <div className="flex items-center gap-1"><p className="truncate text-sm font-semibold">{c.org_name}</p>{c.muted && <BellOff className="h-3 w-3 text-muted-foreground" />}<span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(c.last_message_at)}</span></div>
                  <p className="truncate text-[11px] font-medium" style={{ color: c.org_color }}>{c.employee_name || "Waiting for an associate"} · {c.landing_title}</p>
                  <div className="flex items-center"><p className="truncate text-xs text-muted-foreground">{c.typing ? <span className="text-primary">typing…</span> : c.last_message}</p>{c.unread > 0 && <span className="bg-brand ml-auto rounded-full px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}</div>
                </div>
              </button>
            ))}
          </div>
          <p className="flex items-center gap-1 border-t px-4 py-2 text-[10px] text-emerald-600" data-testid="customer-secure-footer"><ShieldAlert className="h-3 w-3" /> 100% private & secure · each business only sees its own chat with you</p>
        </aside>
        <main className={cn("min-w-0 flex-1", !conversationId && "hidden md:block")}>
          {conversationId && active.isError && <div className="p-6"><EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Conversation unavailable" text="It doesn't exist or belongs to another account." action={<Button onClick={() => nav("/chat")} data-testid="back-to-chats-button">Back to chats</Button>} /></div>}
          {conv ? (
            <ChatThread key={conv.id} conv={conv} viewer="customer" onBack={() => nav("/chat")}
              title={conv.employee_name || conv.org_name} avatar={conv.employee_avatar} status={conv.employee_status}
              subtitle={<span className="inline-flex items-center gap-1">{conv.org_name} · {conv.employee_status === "online" ? "online" : "offline"}</span>}
              headerExtra={
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" data-testid="customer-conv-menu" />}><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => patch.mutate({ archived: !conv.archived })} data-testid="customer-menu-archive"><Archive className="h-4 w-4" />{conv.archived ? "Unarchive" : "Archive"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => patch.mutate({ muted: !conv.muted })} data-testid="customer-menu-mute"><BellOff className="h-4 w-4" />{conv.muted ? "Unmute" : "Mute"}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setReport(true)} data-testid="customer-menu-block"><Ban className="h-4 w-4" />{conv.blocked ? "Unblock" : "Block & report"}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ) : !conversationId && (
            <div className="chat-wall flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <Logo />
              <p className="max-w-sm text-sm text-muted-foreground">Select a chat to continue. Your conversations with every business live here — install once, chat everywhere.</p>
              <VerifiedBadge />
            </div>
          )}
        </main>
      </div>
      <PrefsDialog me={me.data} open={prefs} onOpenChange={setPrefs} />
      {conv && <ReportDialog conv={conv} open={report} onOpenChange={setReport} />}
    </div>
  );
}
