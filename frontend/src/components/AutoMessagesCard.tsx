import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/common";
import { MediaAttachField } from "@/components/chat/Stickers";
import { apiGet, apiPut } from "@/lib/api";
import { toastErr, useMe } from "@/lib/hooks";
import type { AutoMessages } from "@/lib/types";

const TEMPLATES = [
  "Hi {name}! 👋 I'm {employee} from {org}. Thanks for reaching out, how can I help you today?",
  "Here's what we offer: ✅ Fast support ✅ Best prices ✅ Trusted by thousands. Ask me anything!",
  "Tip: install the talksme.in app and turn on notifications so you never miss my reply 🔔",
  "I'm available 10 AM–8 PM. Leave your question and I'll reply as soon as I'm back 🙏",
];

/** Employee's pre-made automatic messages: sent the moment a customer starts a chat (and optionally when they come back). */
export function AutoMessagesCard() {
  const qc = useQueryClient();
  const me = useMe();
  const q = useQuery({ queryKey: ["auto-messages"], queryFn: () => apiGet<AutoMessages>("/employee/auto-messages") });
  const [d, setD] = useState<AutoMessages | null>(null);
  useEffect(() => { if (q.data && !d) setD(q.data); }, [q.data, d]);
  const save = useMutation({
    mutationFn: (b: AutoMessages) => apiPut<AutoMessages>("/employee/auto-messages", b),
    onSuccess: (r) => { qc.setQueryData(["auto-messages"], r); setD(r); toast.success("Auto messages saved"); },
    onError: toastErr,
  });
  if (q.isLoading || !d) return <Skeleton className="h-48" />;
  const preview = (t: string) => t.replace("{name}", "Rahul").replace("{employee}", me.data?.name ?? "You").replace("{org}", "your business");
  const setMsg = (i: number, patch: Partial<AutoMessages["welcome"][number]>) => setD({ ...d, welcome: d.welcome.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const valid = d.welcome.every((m) => m.text.trim() || m.attachment) && (!d.return_enabled || d.return_text.trim());

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5" data-testid="auto-messages-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-primary" /> Automatic welcome messages</p>
          <p className="text-xs text-muted-foreground">Sent instantly as you when a new customer starts a chat with you, so nobody waits in silence. Use <code>{"{name}"}</code>, <code>{"{employee}"}</code> and <code>{"{org}"}</code>.</p>
        </div>
        <Switch checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: v })} data-testid="auto-enabled-switch" />
      </div>
      <div className={d.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-50"}>
        {d.welcome.map((m, i) => (
          <div key={m.id || i} className="rounded-xl border bg-muted/30 p-3" data-testid="auto-message-item">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">Message {i + 1}
              <Switch className="ml-auto" checked={m.enabled} onCheckedChange={(v) => setMsg(i, { enabled: v })} data-testid="auto-message-toggle" />
              <Button size="icon-sm" variant="ghost" onClick={() => setD({ ...d, welcome: d.welcome.filter((_, j) => j !== i) })} data-testid="auto-message-delete"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <Textarea value={m.text} maxLength={1000} onChange={(e) => setMsg(i, { text: e.target.value })} rows={2} data-testid="auto-message-input" />
            <div className="mt-1.5"><MediaAttachField value={m.attachment ?? null} onChange={(a) => setMsg(i, { attachment: a })} testid="auto-message-media" /></div>
            {m.text && <p className="mt-1.5 rounded-lg bg-bubble-out px-2.5 py-1.5 text-xs text-bubble-out-foreground" data-testid="auto-message-preview">{preview(m.text)}</p>}
          </div>
        ))}
        {d.welcome.length < 20 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setD({ ...d, welcome: [...d.welcome, { id: "", text: "", attachment: null, enabled: true }] })} data-testid="auto-message-add"><Plus className="h-3.5 w-3.5" /> Add message</Button>
            {TEMPLATES.filter((t) => !d.welcome.some((m) => m.text === t)).slice(0, 3).map((t) => (
              <button key={t} onClick={() => setD({ ...d, welcome: [...d.welcome, { id: "", text: t, attachment: null, enabled: true }] })} className="max-w-60 truncate rounded-full border bg-background px-3 py-1 text-xs transition-colors duration-150 hover:bg-muted" data-testid="auto-template-chip">+ {t}</button>
            ))}
          </div>
        )}
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">Welcome-back message <span className="text-xs font-normal text-muted-foreground">(when a customer returns after 12+ hours)</span>
            <Switch className="ml-auto" checked={d.return_enabled} onCheckedChange={(v) => setD({ ...d, return_enabled: v })} data-testid="auto-return-switch" />
          </div>
          {d.return_enabled && <Textarea value={d.return_text} maxLength={1000} onChange={(e) => setD({ ...d, return_text: e.target.value })} rows={2} placeholder="Welcome back {name}! 😊" data-testid="auto-return-input" />}
        </div>
      </div>
      <Button disabled={!valid || save.isPending} onClick={() => save.mutate(d)} data-testid="auto-messages-save">{save.isPending ? "Saving…" : "Save auto messages"}</Button>
    </div>
  );
}
