import { Images, Link2, Plus, QrCode, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/hooks";
import { uploadFile } from "@/lib/media";
import { upiLink } from "@/components/recharge/RechargeFlow";
import type { LandingPageInput, PaymentConfig, RechargeService, TrustLink } from "@/lib/types";
import { cn } from "@/lib/utils";

export const rechargeErrors = (f: LandingPageInput): string[] => {
  const e: string[] = [];
  const svcs = f.services ?? [];
  if (!svcs.length) e.push("Add at least one recharge service");
  svcs.forEach((s) => {
    if (!s.name.trim()) e.push("Every service needs a name");
    if (!(s.min_amount > 0) || !(s.max_amount >= s.min_amount)) e.push(`${s.name || "Service"}: maximum must be at least the minimum`);
  });
  if (f.payment.qr_mode === "auto" && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(f.payment.upi_id.trim())) e.push("Enter a valid UPI ID (e.g. talksme@upi)");
  if (f.payment.qr_mode === "image" && !f.payment.qr_image) e.push("Upload your payment QR image");
  (f.trust_links ?? []).forEach((l) => { if (l.url && !/^https?:\/\/\S{3,}$/.test(l.url)) e.push(`Trust link "${l.title || l.url}" must start with https://`); });
  return e;
};

const pickImage = async (cb: (url: string) => void) => {
  const i = document.createElement("input");
  i.type = "file"; i.accept = "image/*";
  i.onchange = async () => { const file = i.files?.[0]; if (!file) return; try { cb((await uploadFile(file)).url); toast.success("Image uploaded"); } catch (e) { toast.error((e as Error).message); } };
  i.click();
};

/** Template C editor: services (image, brief, min/max, bonus %) + UPI payment details (auto QR with amount, or uploaded QR). */
export function RechargeEditor({ services, payment, onServices, onPayment, slides, onSlides, trustLinks, onTrustLinks }: {
  services: RechargeService[]; payment: PaymentConfig; onServices: (v: RechargeService[]) => void; onPayment: (v: PaymentConfig) => void;
  slides: string[]; onSlides: (v: string[]) => void; trustLinks: TrustLink[]; onTrustLinks: (v: TrustLink[]) => void;
}) {
  const updLink = (i: number, p: Partial<TrustLink>) => onTrustLinks(trustLinks.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const upd = (i: number, p: Partial<RechargeService>) => onServices(services.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const pay = (p: Partial<PaymentConfig>) => onPayment({ ...payment, ...p });
  return (
    <div className="space-y-3" data-testid="recharge-editor">
      <div className="space-y-2 rounded-xl border p-3" data-testid="recharge-slides-editor">
        <Label className="flex items-center gap-1.5"><Images className="h-4 w-4" /> Banner slider (top of the page)</Label>
        <p className="rounded-lg bg-primary/5 p-2 text-[11px] text-muted-foreground">📐 Best size: <b>1200 × 600 px</b> (2:1, landscape). JPG or WebP under 1 MB. Keep text in the middle 80% so it isn't cut on small phones. Up to 8 banners; they slide every 3.5 s.</p>
        <div className="grid grid-cols-2 gap-2">
          {slides.map((src, i) => (
            <div key={src + i} className="group relative aspect-[2/1] overflow-hidden rounded-lg border" data-testid="recharge-slide">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{i + 1}</span>
              <div className="absolute right-1 top-1 flex gap-1">
                {i > 0 && <Button size="icon-sm" variant="secondary" onClick={() => { const n = [...slides]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onSlides(n); }} aria-label="Move left">←</Button>}
                <Button size="icon-sm" variant="destructive" onClick={() => onSlides(slides.filter((_, j) => j !== i))} data-testid="recharge-slide-delete"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {slides.length < 8 && <button onClick={() => void pickImage((url) => onSlides([...slides, url]))} className="flex aspect-[2/1] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted/50" data-testid="recharge-slide-add"><Upload className="h-4 w-4" />Add banner</button>}
        </div>
      </div>
      <div className="space-y-2 rounded-xl border p-3">
        <Label>Recharge services</Label>
        {services.map((s, i) => (
          <div key={s.id} className="space-y-1.5 rounded-xl border bg-muted/20 p-2" data-testid="recharge-service-row">
            <div className="flex gap-2">
              <button onClick={() => void pickImage((url) => upd(i, { image: url }))} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background text-muted-foreground" data-testid="recharge-service-image">
                {s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : <Upload className="h-5 w-5" />}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <Input className="h-8" value={s.name} maxLength={60} placeholder="Service name (e.g. Service X)" onChange={(e) => upd(i, { name: e.target.value })} data-testid="recharge-service-name" />
                <Input className="h-8" value={s.brief} maxLength={300} placeholder="Short brief about the service" onChange={(e) => upd(i, { brief: e.target.value })} data-testid="recharge-service-brief" />
              </div>
              <div className="flex flex-col items-center gap-1"><Switch checked={s.active} onCheckedChange={(v) => upd(i, { active: v })} aria-label="Active" /><Button size="icon-sm" variant="ghost" onClick={() => onServices(services.filter((_, j) => j !== i))} data-testid="recharge-service-delete"><Trash2 className="h-3.5 w-3.5" /></Button></div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div><p className="text-[10px] text-muted-foreground">Min ₹</p><Input className="h-8" inputMode="decimal" value={s.min_amount} onChange={(e) => upd(i, { min_amount: Number(e.target.value) || 0 })} data-testid="recharge-service-min" /></div>
              <div><p className="text-[10px] text-muted-foreground">Max ₹</p><Input className="h-8" inputMode="decimal" value={s.max_amount} onChange={(e) => upd(i, { max_amount: Number(e.target.value) || 0 })} data-testid="recharge-service-max" /></div>
              <div><p className="text-[10px] text-muted-foreground">Bonus %</p><Input className="h-8" inputMode="decimal" value={s.bonus_pct} onChange={(e) => upd(i, { bonus_pct: Math.min(500, Number(e.target.value) || 0) })} data-testid="recharge-service-bonus" /></div>
            </div>
            {s.bonus_pct > 0 && <p className="text-[11px] text-emerald-700">Pay ₹{s.min_amount} → gets ₹{(s.min_amount * (1 + s.bonus_pct / 100)).toFixed(0)}</p>}
          </div>
        ))}
        {services.length < 30 && <Button size="sm" variant="outline" onClick={() => onServices([...services, { id: uid(), name: "", image: "", brief: "", min_amount: 100, max_amount: 10000, bonus_pct: 10, active: true }])} data-testid="recharge-add-service"><Plus className="h-3.5 w-3.5" /> Add service</Button>}
      </div>
      <div className="space-y-2 rounded-xl border p-3" data-testid="recharge-payment-editor">
        <Label className="flex items-center gap-1.5"><QrCode className="h-4 w-4" /> Payment QR (change any time)</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["auto", "image"] as const).map((m) => (
            <button key={m} onClick={() => pay({ qr_mode: m })} className={cn("rounded-lg border p-2 text-left text-xs transition-colors duration-150", payment.qr_mode === m && "border-primary bg-accent")} data-testid={`recharge-qr-mode-${m}`}>
              <b>{m === "auto" ? "Auto QR with amount" : "My uploaded QR"}</b><p className="text-muted-foreground">{m === "auto" ? "Exact amount filled in" : "Customer types amount"}</p>
            </button>
          ))}
        </div>
        <Input value={payment.payee_name} maxLength={80} placeholder="Name on QR (payee name)" onChange={(e) => pay({ payee_name: e.target.value })} data-testid="recharge-payee-input" />
        <Input value={payment.upi_id} maxLength={80} placeholder="UPI ID (e.g. talksme@okaxis)" onChange={(e) => pay({ upi_id: e.target.value.trim() })} data-testid="recharge-upi-input" />
        {payment.qr_mode === "image" && (
          <div className="flex items-center gap-2">
            {payment.qr_image && <img src={payment.qr_image} alt="QR" className="h-20 w-20 rounded-lg border object-contain" />}
            <Button size="sm" variant="outline" onClick={() => void pickImage((url) => pay({ qr_image: url }))} data-testid="recharge-qr-upload"><Upload className="h-3.5 w-3.5" /> {payment.qr_image ? "Change QR image" : "Upload QR image"}</Button>
          </div>
        )}
        {payment.qr_mode === "auto" && payment.upi_id && <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="rounded-lg border bg-white p-1"><QRCodeSVG value={upiLink(payment.upi_id, payment.payee_name, 100, "Preview")} size={64} /></span>Preview for ₹100. Customers get a QR with their exact amount.</div>}
        <Input value={payment.note} maxLength={200} placeholder="Note on payment screen (optional), e.g. 'Pay only to this UPI'" onChange={(e) => pay({ note: e.target.value })} data-testid="recharge-note-config" />
      </div>
      <div className="space-y-2 rounded-xl border p-3" data-testid="recharge-trust-links-editor">
        <Label className="flex items-center gap-1.5"><Link2 className="h-4 w-4" /> "For more trust, check our site" (shown after the services)</Label>
        {trustLinks.map((l, i) => (
          <div key={l.id} className="flex gap-2" data-testid="recharge-trust-link-row">
            <button onClick={() => void pickImage((url) => updLink(i, { image: url }))} className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-muted-foreground">{l.image ? <img src={l.image} alt="" className="h-full w-full object-cover" /> : <Upload className="h-4 w-4" />}</button>
            <div className="min-w-0 flex-1 space-y-1">
              <Input className="h-7 text-xs" value={l.title} maxLength={60} placeholder="Title (e.g. Our website, Instagram)" onChange={(e) => updLink(i, { title: e.target.value })} data-testid="recharge-trust-link-title" />
              <Input className="h-7 text-xs" value={l.url} placeholder="https://…" onChange={(e) => updLink(i, { url: e.target.value.trim() })} data-testid="recharge-trust-link-url" />
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => onTrustLinks(trustLinks.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        {trustLinks.length < 12 && <Button size="sm" variant="outline" onClick={() => onTrustLinks([...trustLinks, { id: uid(), title: "", image: "", url: "" }])} data-testid="recharge-trust-link-add"><Plus className="h-3.5 w-3.5" /> Add link / proof image</Button>}
        <p className="text-[11px] text-muted-foreground">Tip: the 3 trust tiles under "Need help" use the trust highlights below (e.g. Verified employees · Secure & encrypted · Duplicate-proof).</p>
      </div>
    </div>
  );
}
