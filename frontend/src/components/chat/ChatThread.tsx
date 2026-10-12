import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Linkify } from "@/components/chat/Linkify";
import { toast } from "sonner";
import {
  ArrowLeft, Check, CheckCheck, Clock, CornerUpLeft, FileText, Image as ImageIcon, Mic, Paperclip, Search, SendHorizontal,
  Smile, Square, Trash2, Video, X, AlertCircle, Lock, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, Skeleton } from "@/components/common";
import { CallButton, startCall } from "@/components/chat/CallModal";
import { InstallBanner, NotifyBanner } from "@/components/AppBanners";
import { BackupPhoneCard } from "@/components/chat/BackupPhone";
import { MAX_UPLOAD, uploadFile } from "@/lib/media";
import { isTyping, wsSend } from "@/lib/realtime";
import { apiGet, apiPost } from "@/lib/api";
import { clock, errMsg, uid } from "@/lib/hooks";
import type { Attachment, Conversation, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMOJIS = "😀 😂 😊 😍 🤩 😎 🤔 😅 🙏 👍 👏 🙌 💪 🔥 ✨ 🎉 ❤️ 💙 💜 ✅ ❌ ⭐ 📞 📷 💰 🏠 📦 🚀 ⏰ 👋 🤝 😢 😮 🙂 😉 👌".split(" ");

function Ticks({ m }: { m: Message }) {
  if (m.failed) return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (m.pending) return <Clock className="h-3 w-3" />;
  if (m.status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" data-testid="receipt-read" />;
  if (m.status === "delivered") return <CheckCheck className="h-3.5 w-3.5" data-testid="receipt-delivered" />;
  return <Check className="h-3.5 w-3.5" data-testid="receipt-sent" />;
}

function AttachmentView({ a }: { a: Attachment }) {
  if (a.kind === "image" && a.url) return <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="mb-1 max-h-60 w-full rounded-lg object-cover" /></a>;
  if (a.kind === "video" && a.url) return <video src={a.url} controls preload="metadata" className="mb-1 max-h-60 w-full rounded-lg bg-black" />;
  if (a.kind === "audio" && a.url) return <audio src={a.url} controls preload="metadata" className="mb-1 h-10 w-60 max-w-full" data-testid="voice-note-player" />;
  return (
    <a href={a.url || undefined} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 p-2 dark:bg-white/5">
      <FileText className="h-5 w-5" /><span className="truncate text-sm">{a.name}</span>
      <span className="ml-auto text-[10px] opacity-60">{Math.round(a.size / 1024)} KB</span>
    </a>
  );
}

export function ChatThread({ conv, viewer, onBack, headerExtra, title, subtitle, avatar, status }: {
  conv: Conversation; viewer: "customer" | "employee" | "admin"; onBack?: () => void; headerExtra?: React.ReactNode;
  title: string; subtitle: React.ReactNode; avatar?: string; status?: string;
}) {
  const qc = useQueryClient();
  const key = ["messages", conv.id];
  const mine = viewer === "customer" ? "customer" : "employee";
  const loc = useLocation();
  // Landing-page default message: prefilled once for a brand-new chat (customer can edit or send it).
  const [text, setText] = useState(() => (viewer === "customer" && (loc.state as { prefill?: string } | null)?.prefill) || "");
  const [reply, setReply] = useState<Message | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelRec = useRef(false);
  const typingQ = useQuery({ queryKey: ["typing", conv.id], queryFn: () => isTyping(conv.id), refetchInterval: 2000 });
  const qrs = useQuery({ queryKey: ["quick-replies"], queryFn: () => apiGet<{ id: string; title: string; text: string }[]>("/quick-replies"), enabled: viewer === "employee" });
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  const q = useQuery({ queryKey: key, queryFn: () => apiGet<Message[]>(`/conversations/${conv.id}/messages`), refetchInterval: 15000 });
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
    if (Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); wsSend({ type: "typing", conversation_id: conv.id }); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD) return toast.error("Photos, videos and files must be 9 MB or smaller");
    setUploading(true);
    try { submit(await uploadFile(f)); } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
  };

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = []; cancelRec.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRec.current) return;
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setUploading(true);
        try { submit({ ...(await uploadFile(blob, `voice-note-${Date.now()}.webm`)), kind: "audio" }); } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
      };
      rec.start(); recorder.current = rec; setRecording(0);
    } catch { toast.error("Microphone access is blocked — allow it to record voice notes"); }
  };
  const stopVoice = (cancel = false) => { cancelRec.current = cancel; recorder.current?.stop(); recorder.current = null; setRecording(null); };

  const disabled = conv.blocked;
  const peerName = viewer === "customer" ? conv.employee_name || conv.org_name : conv.customer_name;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-thread">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-3 backdrop-blur-xl">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} data-testid="chat-back-button"><ArrowLeft className="h-4 w-4" /></Button>}
        <Avatar name={title} src={avatar} size={38} status={status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" data-testid="chat-header-title">{title}</p>
          <p className="truncate text-xs text-muted-foreground" data-testid="chat-header-subtitle">{conv.typing || typingQ.data ? <span className="text-primary">typing…</span> : <>{subtitle} · <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400" data-testid="chat-secure-label"><Lock className="h-3 w-3" />Private & secure</span></>}</p>
        </div>
        {search !== null ? (
          <div className="flex items-center gap-1">
            <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages" className="h-8 w-36 sm:w-52" data-testid="chat-search-input" />
            <Button variant="ghost" size="icon-sm" onClick={() => setSearch(null)} data-testid="chat-search-close"><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setSearch("")} data-testid="chat-search-button"><Search className="h-4 w-4" /></Button>
        )}
        {viewer !== "admin" && <CallButton disabled={!conv.calls_enabled || disabled} onClick={() => startCall({ cid: conv.id, name: peerName, avatar: viewer === "customer" ? conv.employee_avatar : undefined })} />}
        {headerExtra}
      </div>
      {viewer === "customer" && <InstallBanner />}

      <div className="relative min-h-0 flex-1">
      <a href="https://talksme.in" target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-3 z-10 rounded-full border bg-card/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" data-testid="powered-by-talksme">Powered by <b className="text-primary">TalksMe</b></a>
      <div className="chat-wall h-full overflow-y-auto px-3 pb-8 pt-4 sm:px-6" data-testid="chat-messages">
        {q.isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className={cn("h-12 w-2/3", i % 2 && "ml-auto")} />)}</div>}
        {q.isError && <p className="text-center text-sm text-muted-foreground">Messages unavailable — reconnecting…</p>}
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {msgs.map((m) => {
            if (m.kind === "phone_request")
              return viewer === "customer"
                ? <BackupPhoneCard key={m.id} text={m.text} />
                : <div key={m.id} className="my-2 self-center rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm" data-testid="system-message">Asked the customer for a WhatsApp backup number (optional)</div>;
            if (m.sender_role === "system")
              return <div key={m.id} className="my-2 self-center rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm" data-testid="system-message">{m.text}</div>;
            const own = m.sender_role === mine;
            return (
              <div key={m.id} className={cn("group flex max-w-[85%] items-end gap-1 animate-rise sm:max-w-[70%]", own ? "flex-row-reverse self-end" : "self-start")} data-testid="chat-message">
                <div className={cn("rounded-2xl px-3 py-2 text-sm shadow-sm", own ? "rounded-br-md bg-bubble-out text-bubble-out-foreground" : "rounded-bl-md bg-bubble-in")}>
                  {viewer === "admin" && <p className="mb-0.5 text-[10px] font-semibold text-primary">{m.sender_name}</p>}
                  {m.reply_preview && <div className="mb-1 rounded-md border-l-2 border-primary bg-black/5 px-2 py-1 text-xs opacity-80 dark:bg-white/5">{m.reply_preview}</div>}
                  {m.attachment && <AttachmentView a={m.attachment} />}
                  {m.text && <p className="whitespace-pre-wrap break-words" data-testid="chat-message-text"><Linkify text={m.text} /></p>}
                  {m.deleted_by_customer && <p className="mt-0.5 text-[10px] italic text-muted-foreground" data-testid="chat-deleted-by-customer">Customer deleted this for themselves. Still visible to your team.</p>}
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
      </div>

      {viewer === "admin" ? (
        <div className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">Oversight view — admins can reassign this conversation; replies come from the assigned employee.</div>
      ) : disabled ? (
        <div className="border-t bg-card px-4 py-3 text-center text-sm text-muted-foreground" data-testid="chat-blocked-notice">This conversation is blocked. Messaging is disabled.</div>
      ) : (
        <div className="shrink-0 border-t bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-3">
          <NotifyBanner who={viewer === "customer" ? "customer" : "employee"} compact className="mx-0" />
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
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" onClick={() => { if (fileRef.current) { fileRef.current.accept = "image/*,video/*"; fileRef.current.click(); } }} data-testid="attach-photo-video"><ImageIcon className="h-4 w-4" /> Photo or video</button>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" onClick={() => { if (fileRef.current) { fileRef.current.accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"; fileRef.current.click(); } }} data-testid="attach-document"><Paperclip className="h-4 w-4" /> Document</button>
                  <p className="px-2 pt-1 text-[10px] text-muted-foreground" data-testid="attach-size-note">Max 9 MB per photo, video or file</p>
                </PopoverContent>
              </Popover>
              <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.doc,.docx,.xlsx" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="attach-file-input" />
              {viewer === "employee" && (qrs.data?.length ?? 0) > 0 && (
                <Popover>
                  <PopoverTrigger render={<Button variant="ghost" size="icon" data-testid="quick-replies-button" />}><Zap className="h-5 w-5" /></PopoverTrigger>
                  <PopoverContent className="w-72 p-1.5" align="start">
                    {qrs.data?.map((q) => (
                      <button key={q.id} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => setText(q.text)} data-testid="quick-reply-option">
                        <p className="text-sm font-medium">{q.title}</p><p className="truncate text-xs text-muted-foreground">{q.text}</p>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
              {uploading && <span className="self-center text-xs text-muted-foreground" data-testid="upload-progress">Uploading…</span>}
              <textarea
                value={text} onChange={(e) => onType(e.target.value)} rows={1} placeholder="Type a message"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                onFocus={(e) => { const el = e.currentTarget; setTimeout(() => { el.scrollIntoView({ block: "nearest" }); endRef.current?.scrollIntoView({ block: "end" }); }, 300); }}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20"
                data-testid="chat-message-input"
              />
              {text.trim() ? (
                <Button size="icon" className="bg-brand h-10 w-10 rounded-full text-white" onClick={() => submit()} data-testid="chat-send-button"><SendHorizontal className="h-4 w-4" /></Button>
              ) : (
                <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full" onClick={startVoice} disabled={uploading} data-testid="voice-note-button"><Mic className="h-4 w-4" /></Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
