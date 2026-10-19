import { ArrowDown, GitBranch, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MediaAttachField } from "@/components/chat/Stickers";
import { uid } from "@/lib/hooks";
import type { Flow, FlowNode } from "@/lib/types";

const newNode = (title: string): FlowNode => ({ id: uid(), title, messages: [{ id: uid(), text: "", attachment: null }], options: [], prompt: "Please choose an option 👇" });

export const EMPTY_FLOW: Flow = { enabled: false, root: "", nodes: [] };

/** Landing-page chat flow: automatic first messages (unlimited, text/media/voice/sticker) + multi-step choose-an-option menus. */
export function FlowEditor({ value, onChange }: { value: Flow | undefined; onChange: (f: Flow) => void }) {
  const flow = value ?? EMPTY_FLOW;
  const nodes = flow.nodes;
  const set = (f: Partial<Flow>) => onChange({ ...flow, ...f });
  const setNode = (id: string, patch: Partial<FlowNode>) => set({ nodes: nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const ensureRoot = () => {
    if (flow.root && nodes.some((n) => n.id === flow.root)) return set({ enabled: true });
    const r = newNode("Start");
    r.messages = [{ id: uid(), text: "Hi {name}! 👋 Welcome to {org}. I'm {employee}.", attachment: null }];
    set({ enabled: true, root: r.id, nodes: [r, ...nodes] });
  };
  const removeNode = (id: string) => set({ nodes: nodes.filter((n) => n.id !== id).map((n) => ({ ...n, options: n.options.map((o) => (o.next === id ? { ...o, next: "" } : o)) })) });
  const addStepFor = (nodeId: string, optId: string, label: string) => {
    const s = newNode(label);
    set({ nodes: [...nodes.map((n) => (n.id === nodeId ? { ...n, options: n.options.map((o) => (o.id === optId ? { ...o, next: s.id } : o)) } : n)), s] });
  };
  const ordered = [...nodes].sort((a, b) => (a.id === flow.root ? -1 : b.id === flow.root ? 1 : 0));
  return (
    <div className="space-y-3" data-testid="flow-editor">
      <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><GitBranch className="h-4 w-4 text-primary" /> Automatic chat flow</p>
          <p className="text-xs text-muted-foreground">Order in a new chat: the customer's first message (Content tab), then these automatic messages from the employee, then option buttons. Each option can send more messages and open another menu. Placeholders: <code>{"{name}"}</code> <code>{"{employee}"}</code> <code>{"{org}"}</code>. When the flow is on, it replaces the employee's own welcome messages for this page.</p>
        </div>
        <Switch checked={flow.enabled} onCheckedChange={(v) => (v ? ensureRoot() : set({ enabled: false }))} data-testid="flow-enabled-switch" />
      </div>
      {flow.enabled && ordered.map((n) => {
        const isRoot = n.id === flow.root;
        return (
          <div key={n.id} className="space-y-2 rounded-xl border bg-card p-3 shadow-sm" data-testid="flow-node">
            <div className="flex items-center gap-2">
              <span className={isRoot ? "rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground" : "rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase"}>{isRoot ? "First messages" : "Step"}</span>
              <Input className="h-7 text-sm" value={n.title} maxLength={60} onChange={(e) => setNode(n.id, { title: e.target.value })} placeholder="Step name (only you see this)" data-testid="flow-node-title" />
              {!isRoot && <Button size="icon-sm" variant="ghost" onClick={() => removeNode(n.id)} data-testid="flow-node-delete"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
            {n.messages.map((m, i) => (
              <div key={m.id} className="space-y-1.5 rounded-lg border bg-muted/20 p-2" data-testid="flow-message">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">Message {i + 1}
                  <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setNode(n.id, { messages: n.messages.filter((x) => x.id !== m.id) })} data-testid="flow-message-delete"><Trash2 className="h-3 w-3" /></Button>
                </div>
                <Textarea rows={2} maxLength={1000} value={m.text} placeholder="Text (optional when you attach media)" onChange={(e) => setNode(n.id, { messages: n.messages.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x)) })} data-testid="flow-message-text" />
                <MediaAttachField value={m.attachment} testid="flow-message-media" onChange={(a) => setNode(n.id, { messages: n.messages.map((x) => (x.id === m.id ? { ...x, attachment: a } : x)) })} />
              </div>
            ))}
            {n.messages.length < 20 && <Button size="xs" variant="outline" onClick={() => setNode(n.id, { messages: [...n.messages, { id: uid(), text: "", attachment: null }] })} data-testid="flow-message-add"><MessageSquarePlus className="h-3 w-3" /> Add message</Button>}
            <div className="space-y-1.5 rounded-lg border border-dashed p-2">
              <p className="text-[11px] font-semibold text-muted-foreground">Option buttons (customer chooses one)</p>
              {n.options.length > 0 && <Input className="h-7 text-xs" value={n.prompt} maxLength={200} onChange={(e) => setNode(n.id, { prompt: e.target.value })} placeholder="Question above the buttons" data-testid="flow-prompt-input" />}
              {n.options.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-1.5" data-testid="flow-option">
                  <Input className="h-7 w-36 text-xs" value={o.label} maxLength={40} placeholder="e.g. Deposit" onChange={(e) => setNode(n.id, { options: n.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} data-testid="flow-option-label" />
                  <ArrowDown className="h-3 w-3 -rotate-90 text-muted-foreground" />
                  <select className="h-7 rounded-md border bg-background px-1.5 text-xs" value={o.next} onChange={(e) => (e.target.value === "__new" ? addStepFor(n.id, o.id, o.label || "New step") : setNode(n.id, { options: n.options.map((x) => (x.id === o.id ? { ...x, next: e.target.value } : x)) }))} data-testid="flow-option-next">
                    <option value="">End (employee takes over)</option>
                    {nodes.filter((x) => x.id !== n.id && x.id !== flow.root).map((x) => <option key={x.id} value={x.id}>{`→ ${x.title || "Untitled step"}`}</option>)}
                    <option value="__new">+ New step…</option>
                  </select>
                  <Button size="icon-sm" variant="ghost" onClick={() => setNode(n.id, { options: n.options.filter((x) => x.id !== o.id) })} data-testid="flow-option-delete"><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {n.options.length < 10 && <Button size="xs" variant="ghost" onClick={() => setNode(n.id, { options: [...n.options, { id: uid(), label: "", next: "" }] })} data-testid="flow-option-add"><Plus className="h-3 w-3" /> Add option</Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Client-side check mirrored by the server's Pydantic limits. */
export const flowValid = (f: Flow | undefined) => !f?.enabled || f.nodes.every((n) => n.options.every((o) => o.label.trim()) && n.messages.every((m) => m.text.trim() || m.attachment));
