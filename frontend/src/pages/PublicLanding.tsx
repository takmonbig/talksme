import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, MockBadge, Skeleton } from "@/components/common";
import { LandingRender } from "@/components/LandingRender";
import { InstallBanner } from "@/components/AppBanners";
import { appInstalled, isStandalone } from "@/lib/pwa";
import { campaignParams, trackPixels } from "@/lib/pixel";
import { apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { toastErr } from "@/lib/hooks";
import type { PublicLanding as PL, StartChatOut } from "@/lib/types";

const CODES = [["+91", "India"], ["+1", "US/Canada"], ["+44", "UK"], ["+971", "UAE"], ["+65", "Singapore"], ["+61", "Australia"], ["+49", "Germany"], ["+234", "Nigeria"]];

export default function PublicLanding() {
  const { org = "", slug = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["public-lp", org, slug], queryFn: () => apiGet<PL>(`/public/landing/${org}/${slug}`), retry: false, staleTime: Infinity });
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<{ employee_id?: string; image_id?: string }>({});
  const [form, setForm] = useState({ country_code: "+91", phone: "", name: "" });
  const [challenge, setChallenge] = useState<StartChatOut | null>(null);
  const [code, setCode] = useState("");
  const [inApp, setInApp] = useState<string | null>(null);
  const [restore, setRestore] = useState(false);
  const campaign = campaignParams(params);
  const pixels = [...new Set([...(q.data?.page.pixel_ids ?? []), q.data?.page.pixel_id ?? ""].filter(Boolean))];
  const pixelKey = pixels.join(",");

  // Real Meta Pixel (admin-configured): PageView on load, Lead + Contact when the chat starts.
  // Event params carry only page + campaign info, never phone numbers or chat content.
  useEffect(() => { if (pixelKey) trackPixels(pixelKey.split(","), "PageView"); }, [pixelKey]);
  const fire = (ev: "Lead" | "Contact") => { if (pixelKey) trackPixels(pixelKey.split(","), ev, { content_name: q.data?.page.title ?? "", ...campaign }); };

  const finish = (r: StartChatOut) => {
    if (r.status === "verification_required") { setChallenge(r); return; }
    fire("Lead"); fire("Contact");
    beginSession();
    const url = `/chat/${r.conversation_id}`;
    // App installed but we're in the browser: offer to continue in the app; otherwise go straight into the chat.
    appInstalled().then((yes) => { if (yes && !isStandalone()) { setOpen(false); setInApp(url); } else nav(url, { state: { prefill: r.prefill } }); });
  };
  // Chat Now = instant chat as a Guest (no login). The restore dialog sends a phone number to recover old chats.
  const start = useMutation({
    mutationFn: (c: { employee_id?: string; image_id?: string; withPhone?: boolean }) => apiPost<StartChatOut>(`/public/landing/${org}/${slug}/start`,
      { employee_id: c.employee_id, image_id: c.image_id, ...(c.withPhone ? { country_code: form.country_code, phone: form.phone.replace(/\D/g, ""), name: form.name.trim() || undefined } : {}) }),
    onSuccess: finish, onError: toastErr,
  });
  const verify = useMutation({
    mutationFn: () => apiPost<StartChatOut>("/public/verify", { challenge_id: challenge?.challenge_id, code }),
    onSuccess: (r) => { toast.success("Number verified — restoring your conversation"); finish(r); }, onError: toastErr,
  });

  if (q.isLoading) return <div className="mx-auto max-w-xl space-y-4 p-6"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <div className="mx-auto max-w-lg p-10"><EmptyState title="Page not available" text="This landing page doesn't exist or isn't published yet." /></div>;
  const { page, org: o, employees } = q.data;
  const phoneOk = /^\d{6,14}$/.test(form.phone.replace(/\D/g, ""));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur"><div className="mx-auto max-w-5xl"><InstallBanner /></div></div>
      <div className="mx-auto max-w-5xl">
        <LandingRender page={page} orgName={o.name} employees={employees} onChat={(employee_id, image_id) => { if (start.isPending) return; setChoice({ employee_id, image_id }); start.mutate({ employee_id, image_id }); }} />
        <div className="pb-2 text-center">
          <button className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline" onClick={() => { setChallenge(null); setRestore(true); setOpen(true); }} data-testid="restore-chats-link">Chatted with us before? Restore your chats with WhatsApp</button>
        </div>
        {start.isPending && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" data-testid="chat-starting-overlay"><div className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-slate-800 shadow-xl">Opening your chat…</div></div>}
        <p className="pb-6 text-center text-[11px] text-slate-400">talksme.in · a product of Takmon Boost · {o.domain ? `${o.domain}/${page.slug}` : `/p/${o.slug}/${page.slug}`}</p>
      </div>
      <Dialog open={!!inApp} onOpenChange={(o) => { if (!o && inApp) nav(inApp); }}>
        <DialogContent className="sm:max-w-sm" data-testid="open-in-app-dialog">
          <DialogHeader>
            <DialogTitle>You have the talksme app 🎉</DialogTitle>
            <DialogDescription>Your chat is ready. Continue in the installed app for notifications and calls, or keep chatting here.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => { if (inApp) { window.open(inApp, "_blank", "noopener"); nav(inApp); } }} data-testid="open-in-app-button">Open in app</Button>
            <Button variant="outline" className="w-full" onClick={() => inApp && nav(inApp)} data-testid="continue-in-browser-button">Continue here</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="onboarding-dialog">
          {!challenge ? (
            <>
              <DialogHeader>
                <DialogTitle>Restore your chats with {o.name}</DialogTitle>
                <DialogDescription>Enter the WhatsApp number you shared before. We'll send a code on WhatsApp to verify it's you.</DialogDescription>
              </DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (phoneOk) start.mutate({ ...choice, withPhone: true }); }}>
                <div className="space-y-1">
                  <Label>WhatsApp number</Label>
                  <div className="flex gap-2">
                    <Select value={form.country_code} onValueChange={(v: string) => setForm({ ...form, country_code: v })}>
                      <SelectTrigger className="w-28" data-testid="onboarding-country-select"><SelectValue /></SelectTrigger>
                      <SelectContent>{CODES.map(([c, n]) => <SelectItem key={c} value={c}>{c} {n}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98765 43210" data-testid="onboarding-phone-input" />
                  </div>
                  {form.phone && !phoneOk && <p className="text-xs text-destructive" data-testid="onboarding-phone-error">Enter 6–14 digits</p>}
                </div>
                <div className="space-y-1">
                  <Label>Your name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rahul" data-testid="onboarding-name-input" />
                </div>
                <DialogFooter><Button type="submit" className="w-full" disabled={!phoneOk || start.isPending} data-testid="onboarding-submit-button">{start.isPending ? "Checking…" : "Continue"}</Button></DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Verify it's you</DialogTitle>
                <DialogDescription>This number already has conversations. To protect them, enter the 6-digit code we sent on WhatsApp to {form.country_code} {form.phone}.</DialogDescription>
              </DialogHeader>
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="text-center font-mono text-lg tracking-[0.5em]" data-testid="onboarding-otp-input" />
              <DialogFooter><Button className="w-full" disabled={code.length !== 6 || verify.isPending} onClick={() => verify.mutate()} data-testid="onboarding-verify-button">Verify & continue</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
