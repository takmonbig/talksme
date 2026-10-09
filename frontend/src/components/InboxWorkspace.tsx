import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, BellOff, Flag, MoreVertical, PanelRight, PhoneIncoming, Search, Shuffle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, EmptyState, ErrorState, MockBadge, Skeleton } from "@/components/common";
import { ChatThread } from "@/components/chat/ChatThread";
import { CustomerPanel } from "@/components/crm/CustomerPanel";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { timeAgo, toastErr } from "@/lib/hooks";
import type { Conversation, EmployeeStat } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: string; label: string; admin?: boolean }[] = [
  { key: "all", label: "All" }, { key: "unread", label: "Unread" }, { key: "queue", label: "Queue" }, { key: "vip", label: "VIP" },
  { key: "followup", label: "Follow-ups" }, { key: "archived", label: "Archived" },
];

function AssignDialog({ conv, open, onOpenChange }: { conv: Conversation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const emps = useQuery({ queryKey: ["employees"], queryFn: () => apiGet<EmployeeStat[]>("/employees"), enabled: open });
  const [to, setTo] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<Conversation>(`/conversations/${conv.id}/assign`, { employee_id: to, reason: "Admin reassignment" }),
    onSuccess: (c) => { toast.success(`Reassigned to ${c.employee_name}`); qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["messages", conv.id] }); onOpenChange(false); },
    onError: toastErr,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="assign-dialog">
        <DialogHeader><DialogTitle>Reassign conversation</DialogTitle></DialogHeader>
        <Select value={to} onValueChange={(v: string) => setTo(v)}>
          <SelectTrigger className="w-full" data-testid="assign-employee-select"><SelectValue>{(v) => emps.data?.find((e) => e.id === v)?.name ?? "Choose employee"}</SelectValue></SelectTrigger>
          <SelectContent>{(emps.data ?? []).filter((e) => e.active).map((e) => <SelectItem key={e.id} value={e.id}>{e.name} · {e.open_conversations} open · {e.status}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter><Button disabled={!to || m.isPending} onClick={() => m.mutate()} data-testid="assign-submit-button">Reassign</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** WhatsApp Web-style 3-pane workspace: list · thread · customer 360°. */
export function InboxWorkspace({ mode }: { mode: "employee" | "admin" }) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState(false);
  const [assign, setAssign] = useState(false);
  const selected = params.get("c");
  const list = useQuery({
    queryKey: ["conversations", mode, filter, q],
    queryFn: () => apiGet<Conversation[]>(`/conversations?filter=${filter}&q=${encodeURIComponent(q)}`),
    refetchInterval: 20000,
  });
  const conv = list.data?.find((c) => c.id === selected) ?? null;
  const sel = useQuery({ queryKey: ["conversation", selected], queryFn: () => apiGet<Conversation>(`/conversations/${selected}`), enabled: !!selected && !conv, refetchInterval: 4000 });
  const active = conv ?? sel.data ?? null;
  const patch = useMutation({
    mutationFn: (b: Record<string, boolean>) => apiPatch<Conversation>(`/conversations/${active?.id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); toast.success("Conversation updated"); },
    onError: toastErr,
  });
  const open = (id: string | null) => setParams(id ? { c: id } : {});

  return (
    <div className="-m-3 flex h-[calc(100vh-3.5rem)] overflow-hidden border-t bg-card sm:-m-6" data-testid="inbox-workspace">
      {/* left */}
      <aside className={cn("flex w-full shrink-0 flex-col border-r md:w-80 lg:w-[340px]", active && "hidden md:flex")}>
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold">{mode === "admin" ? "Conversations" : "Chats"}</h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600" data-testid="realtime-live-badge"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or message" className="pl-9" data-testid="inbox-search-input" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} data-testid={`inbox-filter-${f.key}`}
                className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150",
                  filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                {f.key === "all" && mode === "employee" ? "Assigned" : f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="conversation-list">
          {list.isLoading && <div className="space-y-2 p-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
          {list.isError && <div className="p-3"><ErrorState onRetry={() => list.refetch()} /></div>}
          {list.data?.length === 0 && <div className="p-4"><EmptyState title="No conversations" text="Nothing matches this filter yet." /></div>}
          {list.data?.map((c) => (
            <button key={c.id} onClick={() => open(c.id)} data-testid="conversation-list-item"
              className={cn("flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors duration-150 hover:bg-muted/60", c.id === active?.id && "bg-accent")}>
              <Avatar name={c.customer_name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-semibold">{c.customer_name}</p>
                  {c.vip && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                  {c.muted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <p className="truncate text-xs text-muted-foreground">{c.typing ? <span className="text-primary">typing…</span> : c.last_message}</p>
                  {c.unread > 0 && <span className="bg-brand ml-auto rounded-full px-1.5 text-[10px] font-bold text-white" data-testid="conversation-unread-badge">{c.unread}</span>}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{c.landing_title}{mode === "admin" && ` · ${c.employee_name || "Unassigned"}`}{c.blocked && " · blocked"}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* center */}
      <section className={cn("min-w-0 flex-1", !active && "hidden md:block")}>
        {active ? (
          <ChatThread
            key={active.id} conv={active} viewer={mode} onBack={() => open(null)}
            title={active.customer_name}
            subtitle={<>{active.customer_phone} · {active.landing_title}{mode === "admin" && ` · ${active.employee_name || "Queue"}`}</>}
            headerExtra={
              <>
                <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setPanel(true)} data-testid="open-customer-panel"><PanelRight className="h-4 w-4" /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" data-testid="conversation-menu-button" />}><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => patch.mutate({ archived: !active.archived })} data-testid="menu-archive"><Archive className="h-4 w-4" />{active.archived ? "Unarchive" : "Archive"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => patch.mutate({ muted: !active.muted })} data-testid="menu-mute"><BellOff className="h-4 w-4" />{active.muted ? "Unmute" : "Mute"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => patch.mutate({ follow_up: !active.follow_up })} data-testid="menu-followup"><Flag className="h-4 w-4" />{active.follow_up ? "Clear follow-up" : "Mark follow-up"}</DropdownMenuItem>
                    {mode === "admin" && (
                      <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setAssign(true)} data-testid="menu-reassign"><Shuffle className="h-4 w-4" />Reassign</DropdownMenuItem></>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        ) : (
          <div className="chat-wall flex h-full items-center justify-center p-6">
            <EmptyState title="Select a conversation" text="Pick a chat from the left to start replying. New customer messages appear automatically." />
          </div>
        )}
      </section>

      {/* right */}
      {active && (
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l xl:block">
          <CustomerPanel customerId={active.customer_id} conversationId={active.id} employeeId={active.employee_id} canTransfer={mode === "employee"} />
        </aside>
      )}
      <Sheet open={panel} onOpenChange={setPanel}>
        <SheetContent className="w-[340px] overflow-y-auto p-0"><SheetTitle className="sr-only">Customer</SheetTitle>
          {active && <CustomerPanel customerId={active.customer_id} conversationId={active.id} employeeId={active.employee_id} canTransfer={mode === "employee"} />}
        </SheetContent>
      </Sheet>
      {active && mode === "admin" && <AssignDialog conv={active} open={assign} onOpenChange={setAssign} />}
    </div>
  );
}
