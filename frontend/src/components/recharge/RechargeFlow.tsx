import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Copy, Eye, EyeOff, Gift, ImageUp, KeyRound, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/common";
import { PhoneForm } from "@/components/chat/BackupPhone";
import { StatusPill } from "@/components/recharge/RechargeQueue";
import { apiGet, apiPost } from "@/lib/api";
import { money, timeAgo, toastErr } from "@/lib/hooks";
import { uploadFile } from "@/lib/media";
import { enableNotifications, useNotificationPermission } from "@/lib/pwa";
import { onRealtime } from "@/lib/realtime";
import type { LandingPageInput, RechargeRequest, RechargeService, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "amount" | "pay" | "upload" | "phone" | "done";
const fmt = (n: number) => `₹${Number(n.toFixed(2)).toLocaleString("en-IN")}`;
export const upiLink = (upi: string, name: string, amount: number, note: string) =>
  `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note.slice(0, 40))}`;

/** Customer recharge: amount (+bonus) → pay by UPI QR → upload screenshot → WhatsApp number (mandatory) → submitted. */
export function RechargeFlow({ page, orgSlug, slug, service, ensureSession, onClose }: {
  page: LandingPageInput; orgSlug: string; slug: string; service: RechargeService; ensureSession: () => Promise<string>; onClose: () => void;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const perm = useNotificationPermission();
  const c = page.primary_color;
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState(String(service.min_amount));
  const [shot, setShot] = useState<{ url: string } | null>(null);
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const a = Number(amount);
  const amountOk = Number.isFinite(a) && a >= service.min_amount && a <= service.max_amount;
  const bonus = amountOk ? Math.round(a * service.bonus_pct) / 100 : 0;
  const pay = page.payment;
  const link = upiLink(pay.upi_id, pay.payee_name || "Merchant", a || 0, service.name);
  const mid = Math.round((service.min_amount + service.max_amount) / 2 / 100) * 100;
  const chips = [...new Set([service.min_amount, mid, service.max_amount].filter((x) => x >= service.min_amount && x <= service.max_amount))];

  const submit = useMutation({
    mutationFn: () => apiPost<RechargeRequest>("/recharge", { org_slug: orgSlug, slug, service_id: service.id, amount: a, screenshot_url: shot!.url, utr }),
    onSuccess: () => { setStep("done"); qc.invalidateQueries({ queryKey: ["my-recharges"] }); },
    onError: (e) => { if ((e as { status?: number }).status === 428) setStep("phone"); else toastErr(e); },
  });
  const savePhone = useMutation({
    mutationFn: (b: { country_code: string; phone: string }) => apiPost("/me/backup-phone", b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); submit.mutate(); },
    onError: toastErr,
  });
  const toPay = async () => { setBusy(true); try { await ensureSession(); setStep("pay"); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const upload = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Upload the payment screenshot (image)");
    setBusy(true);
    try { setShot(await uploadFile(f)); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const send = async () => {
    const me = await apiGet<User>("/auth/me").catch(() => null);
    if (!me?.phone) setStep("phone"); else submit.mutate();
  };
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); toast.success("UPI ID copied"); };
  const steps: Step[] = ["amount", "pay", "upload", "done"];
  const idx = steps.indexOf(step === "phone" ? "upload" : step);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !submit.isPending) onClose(); }}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto p-0 sm:max-w-md" data-testid="recharge-flow">
        <div className="flex items-center gap-3 rounded-t-xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${c}, ${c}bb)` }}>
          {service.image && <img src={service.image} alt="" className="h-12 w-12 rounded-xl border-2 border-white/60 object-cover" />}
          <div className="min-w-0"><DialogTitle className="truncate text-lg text-white">{service.name}</DialogTitle><DialogDescription className="text-white/80">Step {idx + 1} of 4</DialogDescription></div>
        </div>
        <div className="flex gap-1 px-4 pt-3">{steps.map((s, i) => <span key={s} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: i <= idx ? c : "#e2e8f0" }} />)}</div>
        <div className="space-y-4 p-4">
          {step === "amount" && (
            <>
              <DialogHeader className="text-left"><p className="font-semibold">How much do you want to add?</p><p className="text-xs text-muted-foreground">Min {fmt(service.min_amount)} · Max {fmt(service.max_amount)}</p></DialogHeader>
              <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₹</span>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-16 pl-10 text-3xl font-bold" data-testid="recharge-amount-input" /></div>
              <div className="flex flex-wrap gap-2">{chips.map((x) => <button key={x} onClick={() => setAmount(String(x))} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold transition-transform duration-150 active:scale-95", a === x && "text-white")} style={a === x ? { background: c, borderColor: c } : undefined} data-testid="recharge-amount-chip">{fmt(x)}</button>)}</div>
              {!amountOk && amount && <p className="text-xs text-destructive" data-testid="recharge-amount-error">Enter between {fmt(service.min_amount)} and {fmt(service.max_amount)}</p>}
              {service.bonus_pct > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 p-3 text-emerald-900" data-testid="recharge-bonus-box">
                  <Gift className="h-8 w-8 shrink-0 animate-[wiggle_1.6s_ease-in-out_infinite]" />
                  <div className="text-sm"><p>You pay <b>{amountOk ? fmt(a) : "–"}</b> + <b>{service.bonus_pct}% bonus</b> {amountOk && <>({fmt(bonus)})</>}</p><p className="text-base font-bold">You get {amountOk ? fmt(a + bonus) : "–"} 🎉</p></div>
                </div>
              )}
              <Button className="h-12 w-full text-base" style={{ background: c }} disabled={!amountOk || busy} onClick={toPay} data-testid="recharge-continue-button">{busy ? "Please wait…" : `Pay ${amountOk ? fmt(a) : ""}`}</Button>
            </>
          )}
          {step === "pay" && (
            <>
              <div className="text-center"><p className="text-sm text-muted-foreground">Pay exactly</p><p className="text-4xl font-black" data-testid="recharge-pay-amount">{fmt(a)}</p>{pay.payee_name && <p className="text-sm">to <b>{pay.payee_name}</b></p>}</div>
              <div className="mx-auto w-fit rounded-2xl border-4 bg-white p-3 shadow-lg" style={{ borderColor: c }} data-testid="recharge-qr">
                {pay.qr_mode === "image" && pay.qr_image ? <img src={pay.qr_image} alt="Payment QR code" className="h-56 w-56 object-contain" />
                  : pay.upi_id ? <QRCodeSVG value={link} size={224} level="M" marginSize={1} /> : <p className="w-56 py-20 text-center text-sm text-muted-foreground">Payment details are not set up yet. Please chat with us.</p>}
              </div>
              {pay.qr_mode === "image" && <p className="text-center text-xs text-muted-foreground">Enter <b>{fmt(a)}</b> in your UPI app after scanning</p>}
              {pay.upi_id && (
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2.5"><div className="min-w-0 flex-1"><p className="text-[10px] uppercase text-muted-foreground">UPI ID</p><p className="truncate font-mono text-sm font-semibold" data-testid="recharge-upi-id">{pay.upi_id}</p></div><Button size="sm" variant="outline" onClick={() => copy(pay.upi_id)} data-testid="recharge-copy-upi"><Copy className="h-3.5 w-3.5" /> Copy</Button></div>
              )}
              {pay.upi_id && <a href={link} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold sm:hidden" style={{ borderColor: c, color: c }} data-testid="recharge-open-upi-app"><Smartphone className="h-4 w-4" /> Open GPay / PhonePe / Paytm</a>}
              {pay.note && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{pay.note}</p>}
              <Button className="h-12 w-full text-base" style={{ background: c }} onClick={() => setStep("upload")} data-testid="recharge-paid-button">I've paid. Upload screenshot</Button>
            </>
          )}
          {(step === "upload" || step === "phone") && (
            <>
              <p className="font-semibold">Upload your payment screenshot</p>
              <button onClick={() => fileRef.current?.click()} className="flex min-h-40 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/50" data-testid="recharge-upload-button">
                {shot ? <img src={shot.url} alt="Screenshot" className="max-h-64 rounded-lg" /> : <><ImageUp className="h-8 w-8" />{busy ? "Uploading…" : "Tap to choose screenshot"}</>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="recharge-file-input" />
              <Input value={utr} maxLength={40} onChange={(e) => setUtr(e.target.value)} placeholder="UPI reference / UTR number (optional)" data-testid="recharge-utr-input" />
              {step === "phone" ? (
                <div className="space-y-2 rounded-2xl border-2 p-3" style={{ borderColor: c }} data-testid="recharge-phone-step">
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Your WhatsApp number (required)</p>
                  <p className="text-xs text-muted-foreground">Payment backup. If anything goes wrong, we'll contact you here.</p>
                  <PhoneForm onSubmit={(b) => savePhone.mutate(b)} pending={savePhone.isPending || submit.isPending} autoFocus />
                </div>
              ) : (
                <Button className="h-12 w-full text-base" style={{ background: c }} disabled={!shot || busy || submit.isPending} onClick={send} data-testid="recharge-submit-button">{submit.isPending ? "Submitting…" : "Submit for verification"}</Button>
              )}
            </>
          )}
          {step === "done" && (
            <div className="space-y-4 text-center" data-testid="recharge-done">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"><CheckCircle2 className="h-9 w-9" /></span>
              <div><p className="text-xl font-bold">Payment submitted!</p><p className="text-sm text-muted-foreground">Our team is verifying your {fmt(a)}. Your {service.name} ID & password will appear in <b>My Services</b>.</p></div>
              {perm !== "granted" && perm !== "unsupported" && (
                <div className="rounded-2xl bg-primary/10 p-3 text-left" data-testid="recharge-notify-prompt">
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><BellRing className="h-4 w-4 text-primary" /> Allow notifications</p>
                  <p className="mb-2 text-xs text-muted-foreground">We'll tell you the moment your ID is ready, even if the app is closed.</p>
                  <Button size="sm" className="w-full" onClick={() => void enableNotifications()} data-testid="recharge-enable-notifications">Allow notifications</Button>
                </div>
              )}
              <Button className="h-12 w-full text-base" style={{ background: c }} onClick={() => nav("/chat?tab=services")} data-testid="recharge-go-services">Go to My Services</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Customer dashboard: every recharge with its status, the delivered ID & password, or the rejection reason. */
export function MyServicesPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-recharges"], queryFn: () => apiGet<RechargeRequest[]>("/me/recharges"), refetchInterval: 30_000 });
  useEffect(() => onRealtime((e) => { if (e.type === "recharge_update") { qc.invalidateQueries({ queryKey: ["my-recharges"] }); toast.success("Your service request was updated", { description: "Check My Services" }); } }), [qc]);
  if (q.isLoading) return <div className="space-y-2 p-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!q.data?.length) return <div className="p-4"><EmptyState title="No services yet" text="Recharge a service from a business's page. Your IDs and passwords show up here." /></div>;
  return (
    <div className="space-y-3 p-3" data-testid="my-services-panel">
      {q.data.map((r) => <ServiceCard key={r.id} r={r} />)}
    </div>
  );
}

function ServiceCard({ r }: { r: RechargeRequest }) {
  const [show, setShow] = useState(false);
  const copy = (t: string, l: string) => { void navigator.clipboard?.writeText(t); toast.success(`${l} copied`); };
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", r.status === "approved" && "border-emerald-400/60")} data-testid="my-service-card">
      <div className="flex items-center gap-3 p-3">
        {r.service_image ? <img src={r.service_image} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-lg">💳</span>}
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.service_name}</p><p className="text-xs text-muted-foreground">{r.org_name} · {money(r.amount)}{r.bonus_amount > 0 && ` + ${money(r.bonus_amount)} bonus`} · {timeAgo(r.created_at)}</p></div>
        <StatusPill s={r.status} />
      </div>
      {r.status === "approved" && r.credentials && (
        <div className="space-y-2 border-t bg-emerald-50/60 p-3 dark:bg-emerald-500/10" data-testid="my-service-credentials">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">🎉 Your {r.service_name} ID & password. Enjoy now!</p>
          {[["ID / Username", r.credentials.username, true], ["Password", r.credentials.password, show]].map(([l, v, vis]) => (
            <div key={l as string} className="flex items-center gap-2 rounded-xl border bg-background p-2">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="text-[10px] uppercase text-muted-foreground">{l}</p><p className="truncate font-mono text-sm font-semibold" data-testid={l === "Password" ? "my-service-password" : "my-service-username"}>{vis ? v : "••••••••"}</p></div>
              {l === "Password" && <Button size="icon-sm" variant="ghost" onClick={() => setShow(!show)} aria-label="Show password" data-testid="my-service-show-password">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>}
              <Button size="icon-sm" variant="ghost" onClick={() => copy(v as string, l as string)} aria-label={`Copy ${l}`}><Copy className="h-4 w-4" /></Button>
            </div>
          ))}
          {r.credentials.note && <p className="text-xs">{r.credentials.note}</p>}
        </div>
      )}
      {r.status === "rejected" && <p className="flex items-start gap-1.5 border-t bg-destructive/5 p-3 text-sm text-destructive" data-testid="my-service-rejected"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />Your request is rejected due to: {r.reject_reason}</p>}
      {r.status === "pending" && <p className="border-t bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">⏳ Our team is verifying your payment. You'll get a notification when it's ready.</p>}
    </div>
  );
}
