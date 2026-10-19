import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Download, ShieldCheck, Upload, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InstallHelpDialog } from "@/components/AppBanners";
import { sendTestPush } from "@/components/Reminders";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { toastErr } from "@/lib/hooks";
import { uploadFile } from "@/lib/media";
import { enableNotifications, notifSupported, useInstallPrompt, useNotificationPermission } from "@/lib/pwa";
import type { IntroOut, Ok, Organization } from "@/lib/types";

const DONE_KEY = "talksme-intro-done";
type Step = "video" | "install" | "notify" | "done";

/** First chat on this device: intro video (skippable after 3s) → Install app → Turn on notifications → chat. */
export function IntroFlow({ orgId }: { orgId: string }) {
  const [step, setStep] = useState<Step>(() => (localStorage.getItem(DONE_KEY) ? "done" : "video"));
  const q = useQuery({ queryKey: ["intro", orgId], queryFn: () => apiGet<IntroOut>(`/public/intro?org_id=${orgId}`), enabled: step !== "done", staleTime: 3600_000 });
  const install = useInstallPrompt();
  const perm = useNotificationPermission();
  const [help, setHelp] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [muted, setMuted] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  // keep the 5-minute notification reminder quiet while the intro runs
  useEffect(() => { if (step !== "done") { sessionStorage.setItem("notify-reminder-at", String(Date.now())); sessionStorage.setItem("intro-session", "1"); } }, [step]);
  useEffect(() => { if (step === "video" && q.data && !q.data.enabled) setStep("install"); }, [step, q.data]);
  useEffect(() => { if (step === "install" && install.installed) setStep("notify"); }, [step, install.installed]);
  useEffect(() => { if (step === "notify" && (perm === "granted" || (!notifSupported()))) finish(); }, [step, perm]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== "video" || !q.data?.url) return;
    const t = setTimeout(() => setCanSkip(true), 3000);
    const v = vid.current;
    if (v) v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => undefined); });
    return () => clearTimeout(t);
  }, [step, q.data?.url]);
  const finish = () => { localStorage.setItem(DONE_KEY, "1"); sessionStorage.setItem("notify-reminder-at", String(Date.now())); setStep("done"); };
  if (step === "done") return null;
  if (step === "video") return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 backdrop-blur" data-testid="intro-video-overlay">
      {q.data?.url ? (
        <video ref={vid} src={q.data.url} playsInline autoPlay className="h-full max-h-[100dvh] w-full max-w-[480px] object-contain" onEnded={() => setStep("install")} onError={() => setStep("install")} data-testid="intro-video" />
      ) : <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />}
      {muted && <button onClick={() => { if (vid.current) { vid.current.muted = false; setMuted(false); } }} className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg" data-testid="intro-unmute"><Volume2 className="h-4 w-4" /> Tap for sound</button>}
      <button disabled={!canSkip} onClick={() => setStep("install")} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur transition-opacity duration-200 disabled:opacity-40" data-testid="intro-skip">
        {canSkip ? <>Skip <X className="h-4 w-4" /></> : "Skip in 3s"}
      </button>
      <p className="absolute bottom-6 left-0 right-0 text-center text-[11px] text-white/60">talksme.in · a product of Takmon Boost</p>
    </div>
  );
  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) (step === "install" ? setStep("notify") : finish()); }}>
        <DialogContent className="sm:max-w-sm" data-testid={step === "install" ? "intro-install-dialog" : "intro-notify-dialog"}>
          <DialogHeader className="items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">{step === "install" ? <Download className="h-8 w-8" /> : <BellRing className="h-8 w-8 animate-[wiggle_1.6s_ease-in-out_infinite]" />}</span>
            <DialogTitle className="text-xl">{step === "install" ? "Install the talksme.in app" : "Turn on notifications"}</DialogTitle>
            <DialogDescription>{step === "install" ? "Free, about 1 MB, no Play Store needed. Your chats with every business stay in one app." : "Get replies and calls instantly, even when the app is closed. You can turn this off any time."}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-xs">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Private, encrypted chats. We never share your number.</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Verified team members only</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> No spam. Only messages from businesses you chat with.</li>
          </ul>
          {step === "install" ? (
            <Button size="lg" className="w-full" data-testid="intro-install-button" onClick={async () => { if (install.canInstall) { await install.prompt(); setStep("notify"); } else setHelp(true); }}><Download className="h-4 w-4" /> Install app</Button>
          ) : (
            <Button size="lg" className="w-full" data-testid="intro-notify-button" onClick={async () => { const p = await enableNotifications(); if (p === "granted") { toast.success("Notifications on 🔔"); void sendTestPush(); } else if (p === "denied") toast.error("Blocked. You can allow notifications later in browser settings"); finish(); }}><BellRing className="h-4 w-4" /> Enable notifications</Button>
          )}
          <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => (step === "install" ? setStep("notify") : finish())} data-testid="intro-later">Maybe later</button>
        </DialogContent>
      </Dialog>
      <InstallHelpDialog open={help} onOpenChange={(o) => { setHelp(o); if (!o) setStep("notify"); }} />
    </>
  );
}

/** Admin settings: replace the platform intro video with your own (or switch it off). */
export function IntroVideoCard() {
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["org"], queryFn: () => apiGet<Organization>("/org") });
  const intro = useQuery({ queryKey: ["intro", org.data?.id], queryFn: () => apiGet<IntroOut>(`/public/intro?org_id=${org.data?.id}`), enabled: !!org.data });
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["org"] }); qc.invalidateQueries({ queryKey: ["intro"] }); };
  const patch = useMutation({ mutationFn: (b: Partial<Organization>) => apiPatch<Organization>("/admin/org", b), onSuccess: () => { toast.success("Intro video updated"); refresh(); }, onError: toastErr });
  const reset = useMutation({ mutationFn: () => apiPost<Ok>("/admin/intro/reset"), onSuccess: (r) => { toast.success(r.message); refresh(); }, onError: toastErr });
  const up = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return toast.error("Choose a video file (MP4 recommended)");
    setBusy(true);
    try { patch.mutate({ intro_video_url: (await uploadFile(f)).url }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (!org.data) return null;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5" data-testid="intro-video-card">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-semibold">First-visit intro video</p><p className="text-xs text-muted-foreground">Plays once per device when a customer opens their first chat, then asks them to install the app and turn on notifications. Customers can skip it after 3 seconds.</p></div>
        <Switch checked={org.data.intro_enabled ?? true} onCheckedChange={(v) => patch.mutate({ intro_enabled: v })} data-testid="intro-enabled-switch" />
      </div>
      {intro.data?.url && <video src={intro.data.url} controls preload="metadata" className="h-56 rounded-xl bg-black" data-testid="intro-video-preview" />}
      <p className="text-xs text-muted-foreground" data-testid="intro-source">{org.data.intro_video_url ? "Using your own video" : "Using the TalksMe default video"}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy || patch.isPending} onClick={() => ref.current?.click()} data-testid="intro-upload-button"><Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload my video (≤ 9 MB)"}</Button>
        {org.data.intro_video_url && <Button size="sm" variant="ghost" onClick={() => reset.mutate()} data-testid="intro-reset-button">Use default video</Button>}
        <input ref={ref} type="file" accept="video/*" className="hidden" onChange={(e) => { void up(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}
