import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Check, CheckCheck, Clock, CornerUpLeft, FileText, Image as ImageIcon, Mic, Paperclip, Search, SendHorizontal,
  Smile, Square, Trash2, Video, X, AlertCircle, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, MockBadge, Skeleton } from "@/components/common";
import { CallButton, CallModal } from "@/components/chat/CallModal";
import { apiGet, apiPost } from "@/lib/api";
import { clock, errMsg, uid } from "@/lib/hooks";
import type { Attachment, Conversation, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMOJIS = "😀 😂 😊 😍 🤩 😎 🤔 😅 🙏 👍 👏 🙌 💪 🔥 ✨ 🎉 ❤️ 💙 💜 ✅ ❌ ⭐ 📞 📷 💰 🏠 📦 🚀 ⏰ 👋 🤝 😢 😮 🙂 😉 👌".split(" ");
const SAMPLE_MEDIA: Record<string, string> = {
  image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=900&q=70",
  video: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=900&q=70",
};

function Ticks({ m }: { m: Message }) {
  if (m.failed) return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (m.pending) return <Clock className="h-3 w-3" />;
  if (m.status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" data-testid="receipt-read" />;
  if (m.status === "delivered") return <CheckCheck className="h-3.5 w-3.5" data-testid="receipt-delivered" />;
  return <Check className="h-3.5 w-3.5" data-testid="receipt-sent" />;
}

function AttachmentView({ a }: { a: Attachment }) {
  if (a.kind === "image" && a.url) return <img src={a.url} alt={a.name} className="mb-1 max-h-60 w-full rounded-lg object-cover" />;
  if (a.kind === "video")
    return (
      <div className="relative mb-1 overflow-hidden rounded-lg">
        <img src={a.url || SAMPLE_MEDIA.video} alt={a.name} className="max-h-52 w-full object-cover opacity-80" />
        <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-full bg-black/50 p-3 text-white"><Play className="h-5 w-5" /></div></div>
      </div>
    );
  if (a.kind === "audio")
    return (
      <div className="mb-1 flex min-w-48 items-center gap-2 rounded-lg bg-black/5 p-2 dark:bg-white/5">
        <div className="rounded-full bg-primary p-1.5 text-primary-foreground"><Play className="h-3 w-3" /></div>
        <div className="flex h-5 flex-1 items-center gap-0.5">{Array.from({ length: 22 }).map((_, i) => <span key={i} className="w-0.5 rounded bg-current opacity-50" style={{ height: `${30 + ((i * 37) % 70)}%` }} />)}</div>
        <span className="text-[11px] opacity-70">{a.name.replace("Voice note ", "")}</span>
      </div>
    );
  return (
    <div className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 p-2 dark:bg-white/5">
      <FileText className="h-5 w-5" /><span className="truncate text-sm">{a.name}</span>
      <span className="ml-auto text-[10px] opacity-60">{Math.round(a.size / 1024)} KB</span>
    </div>
  );
}

export function ChatThread({ conv, viewer, onBack, headerExtra, title, subtitle, avatar, status }: {
  conv: Conversation; viewer: "customer" | "employee" | "admin"; onBack?: () => void; headerExtra?: React.ReactNode;
  title: string; subtitle: React.ReactNode; avatar?: string; status?: string;
}) {
  const qc = useQueryClient();
  const key = ["messages", conv.id];
  const mine = viewer === "customer" ? "customer" : "employee";
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const [call, setCall] = useState<"out" | "in" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  const q = useQuery({ queryKey: key, queryFn: () => apiGet<Message[]>(`/conversations/${conv.id}/messages`), refetchInterval: 3000 });
  const msgs = useMemo(() => (q.data ?? []).filter((m) => !search || m.text.toLowerCase().includes(search.toLowerCase())), [q.data, search]);

  useEffect(() => { if (!search) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [q.data?.length, search]);
  useEffect(() => { if (recording === null) return; const t = setInterval(() => setRecording((r) => (r ?? 0) + 1), 1000); return () => clearInterval(t); }, [recording !== null]); // eslint-disable-line

  const send = useMutation({
    mutationFn: (b: { text: string; attachment: Attachment | null; reply_to: string | null; idempotency_key: string }) =>
      apiPost<Message>(`/conversations/${conv.id}/messages`, b),
    onMutate: async (b) => {
      await qc.cancelQueries({ queryKey: key });
      const optimistic: Message = { id: b.idempotency_key, conversation_id: conv.id, sender_role: mine, sender_id: null, sender_name: "You",
        text: b.text, attachment: b.attachment, reply_to: b.reply_to, reply_preview: reply?.text.slice(0, 80) ?? "", status: "sent",
        created_at: new Date().toISOString(), pending: true, idempotency_key: b.idempotency_key };
      qc.setQueryData<Message[]>(key, (old) => [...(old ?? []).filter((m) => m.id !== b.idempotency_key), optimistic]);
    },
    onSuccess: (m, b) => {
      qc.setQueryData<Message[]>(key, (old) => (old ?? []).map((x) => (x.id === b.idempotency_key ? m : x)));
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e, b) => {
      qc.setQueryData<Message[]>(key, (old) => (old ?? []).map((x) => (x.id === b.idempotency_key ? { ...x, pending: false, failed: true } : x)));
      toast.error(errMsg(e));
    },
  });

  const hide = useMutation({
    mutationFn: (mid: string) => apiPost(`/conversations/${conv.id}/messages/${mid}/hide`),
    onSuccess: () => { toast("Message deleted for you"); qc.invalidateQueries({ queryKey: key }); },
  });

  const submit = (attachment: Attachment | null = null) => {
    if (!text.trim() && !attachment) return;
    send.mutate({ text: text.trim(), attachment, reply_to: reply?.id ?? null, idempotency_key: uid() });
    setText(""); setReply(null);
  };

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); apiPost(`/conversations/${conv.id}/typing`).catch(() => undefined); }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast.error("Files must be under 25 MB");
    const okTypes = ["image/", "video/", "audio/", "application/pdf", "text/plain", "application/zip", "application/vnd"];
    if (!okTypes.some((t) => f.type.startsWith(t))) return toast.error("This file type isn't allowed");
    const kind: Attachment["kind"] = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "file";
    const finish = (url: string) => submit({ kind, name: f.name, url, size: f.size });
    if (kind === "image" && f.size < 700 * 1024) {
      const r = new FileReader(); r.onload = () => finish(String(r.result)); r.readAsDataURL(f);
    } else finish(SAMPLE_MEDIA[kind] ?? "");
  };

  const sendDemo = (kind: "image" | "video") =>
    submit({ kind, name: kind === "image" ? "demo-photo.jpg" : "demo-clip.mp4", url: SAMPLE_MEDIA[kind], size: kind === "image" ? 240_000 : 3_400_000 });

  const stopVoice = (cancel = false) => {
    const s = recording ?? 0; setRecording(null);
    if (!cancel) submit({ kind: "audio", name: `Voice note ${Math.floor(s / 60)}:${String(Math.max(1, s) % 60).padStart(2, "0")}`, url: "", size: Math.max(1, s) * 16000 });
  };

  const disabled = conv.blocked;
  const peerName = viewer === "customer" ? conv.employee_name || conv.org_name : conv.customer_name;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-thread">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-3 backdrop-blur-xl">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} data-testid="chat-back-button"><ArrowLeft className="h-4 w-4" /></Button>}
        <Avatar name={title} src={avatar} size={38} status={status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" data-testid="chat-header-title">{title}</p>
          <p className="truncate text-xs text-muted-foreground" data-testid="chat-header-subtitle">{conv.typing ? <span className="text-primary">typing…</span> : subtitle}</p>
        </div>
        {search !== null ? (
          <div className="flex items-center gap-1">
            <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages" className="h-8 w-36 sm:w-52" data-testid="chat-search-input" />
            <Button variant="ghost" size="icon-sm" onClick={() => setSearch(null)} data-testid="chat-search-close"><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setSearch("")} data-testid="chat-search-button"><Search className="h-4 w-4" /></Button>
        )}
        {viewer !== "admin" && <CallButton disabled={!conv.calls_enabled || disabled} onClick={() => setCall("out")} />}
        {headerExtra}
      </div>

      <div className="chat-wall min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" data-testid="chat-messages">
        {q.isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className={cn("h-12 w-2/3", i % 2 && "ml-auto")} />)}</div>}
        {q.isError && <p className="text-center text-sm text-muted-foreground">Messages unavailable — reconnecting…</p>}
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {msgs.map((m) => {
            if (m.sender_role === "system")
              return <div key={m.id} className="my-2 self-center rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm" data-testid="system-message">{m.text}</div>;
            const own = m.sender_role === mine;
            return (
              <div key={m.id} className={cn("group flex max-w-[85%] items-end gap-1 animate-rise sm:max-w-[70%]", own ? "flex-row-reverse self-end" : "self-start")} data-testid="chat-message">
                <div className={cn("rounded-2xl px-3 py-2 text-sm shadow-sm", own ? "rounded-br-md bg-bubble-out text-bubble-out-foreground" : "rounded-bl-md bg-bubble-in")}>
                  {viewer === "admin" && <p className="mb-0.5 text-[10px] font-semibold text-primary">{m.sender_name}</p>}
                  {m.reply_preview && <div className="mb-1 rounded-md border-l-2 border-primary bg-black/5 px-2 py-1 text-xs opacity-80 dark:bg-white/5">{m.reply_preview}</div>}
                  {m.attachment && <AttachmentView a={m.attachment} />}
                  {m.text && <p className="whitespace-pre-wrap break-words" data-testid="chat-message-text">{m.text}</p>}
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-60">
                    {clock(m.created_at)}{own && <Ticks m={m} />}
                  </div>
                  {m.failed && (
                    <button className="mt-1 text-[11px] font-semibold text-destructive underline" data-testid="chat-retry-button"
                      onClick={() => send.mutate({ text: m.text, attachment: m.attachment, reply_to: m.reply_to, idempotency_key: m.id })}>Tap to retry</button>
                  )}
                </div>
                {!m.pending && !m.failed && (
                  <div className="flex flex-col opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <button className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setReply(m)} title="Reply" data-testid="chat-reply-action"><CornerUpLeft className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => hide.mutate(m.id)} title="Delete for me" data-testid="chat-delete-action"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            );
          })}
          {search && msgs.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages match "{search}"</p>}
          <div ref={endRef} />
        </div>
      </div>

      {viewer === "admin" ? (
        <div className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">Oversight view — admins can reassign this conversation; replies come from the assigned employee.</div>
      ) : disabled ? (
        <div className="border-t bg-card px-4 py-3 text-center text-sm text-muted-foreground" data-testid="chat-blocked-notice">This conversation is blocked. Messaging is disabled.</div>
      ) : (
        <div className="border-t bg-card px-2 py-2 sm:px-3">
          {reply && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted px-3 py-1.5 text-xs" data-testid="chat-reply-preview">
              <span className="truncate">Replying to: {reply.text || "attachment"}</span>
              <button className="ml-auto" onClick={() => setReply(null)}><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {recording !== null ? (
            <div className="flex items-center gap-3 px-2 py-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium" data-testid="voice-recording-timer">Recording {Math.floor(recording / 60)}:{String(recording % 60).padStart(2, "0")}</span>
              <MockBadge label="Simulated voice note" />
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => stopVoice(true)} data-testid="voice-cancel-button">Cancel</Button>
              <Button size="sm" onClick={() => stopVoice()} data-testid="voice-send-button"><Square className="h-3.5 w-3.5" /> Send</Button>
            </div>
          ) : (
            <div className="flex items-end gap-1">
              <Popover>
                <PopoverTrigger render={<Button variant="ghost" size="icon" data-testid="emoji-picker-button" />}><Smile className="h-5 w-5" /></PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map((e) => <button key={e} className="rounded p-1 text-lg transition-transform duration-150 hover:scale-125" onClick={() => setText((t) => t + e)} data-testid="emoji-option">{e}</button>)}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger render={<Button variant="ghost" size="icon" data-testid="attach-button" />}><Paperclip className="h-5 w-5" /></PopoverTrigger>
                <PopoverContent className="w-56 p-1.5" align="start">
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" onClick={() => fileRef.current?.click()} data-testid="attach-upload-file"><Paperclip className="h-4 w-4" /> Upload file…</button>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" onClick={() => sendDemo("image")} data-testid="attach-demo-image"><ImageIcon className="h-4 w-4" /> Send demo photo</button>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" onClick={() => sendDemo("video")} data-testid="attach-demo-video"><Video className="h-4 w-4" /> Send demo video</button>
                  <p className="px-2 pt-1 text-[10px] text-muted-foreground">Media storage is mocked in preview (max 25 MB).</p>
                </PopoverContent>
              </Popover>
              <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.doc,.docx,.xlsx" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="attach-file-input" />
              <textarea
                value={text} onChange={(e) => onType(e.target.value)} rows={1} placeholder="Type a message"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20"
                data-testid="chat-message-input"
              />
              {text.trim() ? (
                <Button size="icon" className="bg-brand h-10 w-10 rounded-full text-white" onClick={() => submit()} data-testid="chat-send-button"><SendHorizontal className="h-4 w-4" /></Button>
              ) : (
                <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full" onClick={() => setRecording(0)} data-testid="voice-note-button"><Mic className="h-4 w-4" /></Button>
              )}
            </div>
          )}
        </div>
      )}
      {call && <CallModal open={!!call} incoming={call === "in"} onClose={() => setCall(null)} conversationId={conv.id} peerName={peerName} peerAvatar={viewer === "customer" ? conv.employee_avatar : undefined} />}
      {viewer === "employee" && conv.calls_enabled && !disabled && (
        <button className="hidden" onClick={() => setCall("in")} data-testid="simulate-incoming-call" id={`incoming-${conv.id}`} />
      )}
    </div>
  );
}
