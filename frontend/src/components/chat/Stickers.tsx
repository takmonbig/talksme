import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Plus, Square, Sticker as StickerIcon, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { toastErr, useMe } from "@/lib/hooks";
import { uploadFile } from "@/lib/media";
import type { Attachment, Sticker } from "@/lib/types";
import { cn } from "@/lib/utils";

const STICKER_TYPES = ["image/png", "image/webp", "image/gif"];

/** WhatsApp-style sticker tray: built-in TalksMe pack, organization stickers and the user's own uploads. */
export function StickerPicker({ onPick, trigger }: { onPick: (a: Attachment) => void; trigger?: React.ReactElement }) {
  const qc = useQueryClient();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [forOrg, setForOrg] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["stickers"], queryFn: () => apiGet<Sticker[]>("/stickers"), enabled: open });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/stickers/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["stickers"] }), onError: toastErr });
  const isAdmin = me.data?.role === "admin";
  const upload = async (f?: File) => {
    if (!f) return;
    if (!STICKER_TYPES.includes(f.type)) return toast.error("Stickers must be PNG, WebP or GIF");
    if (f.size > 2 * 1024 * 1024) return toast.error("Stickers must be 2 MB or smaller");
    setBusy(true);
    try {
      const a = await uploadFile(f);
      await apiPost<Sticker>("/stickers", { url: a.url, name: f.name.replace(/\.\w+$/, "").slice(0, 40), scope: forOrg ? "org" : "mine" });
      toast.success(forOrg ? "Sticker added for your whole team" : "Sticker saved to My stickers");
      qc.invalidateQueries({ queryKey: ["stickers"] });
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const pick = (s: Sticker) => { onPick({ kind: "sticker", name: s.name || "Sticker", url: s.url, size: 0 }); setOpen(false); };
  const grid = (list: Sticker[], removable: boolean) => list.length ? (
    <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
      {list.map((s) => (
        <div key={s.id} className="group relative">
          <button onClick={() => pick(s)} className="flex aspect-square w-full items-center justify-center rounded-lg p-1 transition-transform duration-150 hover:scale-110 hover:bg-muted" data-testid="sticker-option" title={s.name}>
            <img src={s.url} alt={s.name} className="max-h-full max-w-full object-contain" />
          </button>
          {removable && (s.owner_id === me.data?.id || (isAdmin && s.scope === "org")) && (
            <button onClick={() => del.mutate(s.id)} className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-white group-hover:block" aria-label="Delete sticker" data-testid="sticker-delete"><X className="h-3 w-3" /></button>
          )}
        </div>
      ))}
    </div>
  ) : <p className="py-6 text-center text-xs text-muted-foreground">No stickers here yet</p>;
  const all = q.data ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger ?? <Button variant="ghost" size="icon" data-testid="sticker-picker-button" />}><StickerIcon className="h-5 w-5" /></PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start" data-testid="sticker-picker">
        <Tabs defaultValue="builtin">
          <TabsList className="w-full"><TabsTrigger value="builtin">TalksMe</TabsTrigger><TabsTrigger value="org">Team</TabsTrigger><TabsTrigger value="mine" data-testid="sticker-tab-mine">Mine</TabsTrigger></TabsList>
          <TabsContent value="builtin" className="pt-2">{q.isLoading ? <p className="py-6 text-center text-xs">Loading…</p> : grid(all.filter((s) => s.scope === "builtin"), false)}</TabsContent>
          <TabsContent value="org" className="pt-2">{grid(all.filter((s) => s.scope === "org"), true)}</TabsContent>
          <TabsContent value="mine" className="pt-2">{grid(all.filter((s) => s.scope === "mine"), true)}</TabsContent>
        </Tabs>
        <div className="mt-2 flex items-center gap-2 border-t pt-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()} data-testid="sticker-upload-button"><Plus className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload sticker"}</Button>
          {isAdmin && <label className="flex items-center gap-1.5 text-[11px]"><Checkbox checked={forOrg} onCheckedChange={(v) => setForOrg(!!v)} data-testid="sticker-for-org-checkbox" /> For whole team</label>}
          <input ref={ref} type="file" accept=".png,.webp,.gif,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="sticker-file-input" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Attachment preview used in the chat bubble and in the auto-message / flow editors. */
export function AttachmentPreview({ a, small }: { a: Attachment; small?: boolean }) {
  if (a.kind === "sticker") return <img src={a.url} alt={a.name} className={small ? "h-16 w-16 object-contain" : "h-32 w-32 object-contain drop-shadow-md sm:h-36 sm:w-36"} data-testid="sticker-message" />;
  if (a.kind === "image") return <img src={a.url} alt={a.name} className={cn("rounded-lg object-cover", small ? "h-16 w-24" : "max-h-60 w-full")} />;
  if (a.kind === "video") return <video src={a.url} controls preload="metadata" className={cn("rounded-lg bg-black", small ? "h-20 w-32" : "max-h-60 w-full")} />;
  if (a.kind === "audio") return <audio src={a.url} controls preload="metadata" className="h-10 w-60 max-w-full" data-testid="voice-note-player" />;
  return <a href={a.url} target="_blank" rel="noreferrer" className="text-xs underline">{a.name}</a>;
}

/** Attach image / video / voice note (upload or record) / sticker to a pre-made message. */
export function MediaAttachField({ value, onChange, testid = "media-attach" }: { value: Attachment | null; onChange: (a: Attachment | null) => void; testid?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const up = async (f: File | Blob, name?: string) => {
    setBusy(true);
    try { const a = await uploadFile(f, name); onChange(name?.endsWith(".webm") ? { ...a, kind: "audio" } : a); toast.success("Attached"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const record = async () => {
    if (recording) { rec.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setRecording(false); void up(new Blob(chunks, { type: "audio/webm" }), `voice-note-${Date.now()}.webm`); };
      r.start(); rec.current = r; setRecording(true);
    } catch { toast.error("Microphone permission denied"); }
  };
  if (value) return (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-1.5" data-testid={`${testid}-preview`}>
      <AttachmentPreview a={value} small />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{value.kind === "audio" ? "🎤 Voice note" : value.kind === "sticker" ? "🙂 Sticker" : value.name}</span>
      <Button size="icon-sm" variant="ghost" onClick={() => onChange(null)} data-testid={`${testid}-remove`}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="xs" variant="outline" disabled={busy} onClick={() => ref.current?.click()} data-testid={`${testid}-upload`}><Upload className="h-3 w-3" /> {busy ? "Uploading…" : "Image / video / audio"}</Button>
      <Button size="xs" variant={recording ? "destructive" : "outline"} disabled={busy} onClick={record} data-testid={`${testid}-record`}>{recording ? <><Square className="h-3 w-3" /> Stop & attach</> : <><Mic className="h-3 w-3" /> Record voice</>}</Button>
      <StickerPicker onPick={onChange} trigger={<Button size="xs" variant="outline" data-testid={`${testid}-sticker`} />} />
      <input ref={ref} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void up(f); e.target.value = ""; }} />
    </div>
  );
}
