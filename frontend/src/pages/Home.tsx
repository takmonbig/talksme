import { Link } from "react-router-dom";
import { ContactFooter } from "@/components/ContactFooter";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { toastErr } from "@/lib/hooks";
import type { StartChatOut } from "@/lib/types";
import { ArrowRight, BarChart3, CheckCheck, CreditCard, LayoutTemplate, MessageCircle, Phone, ShieldCheck, Shuffle, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo, MockBadge, ThemeToggle } from "@/components/common";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: MessageCircle, t: "WhatsApp-style inbox", d: "Three-pane workspace with receipts, voice notes, media and typing indicators." },
  { icon: LayoutTemplate, t: "Landing-page builder", d: "Image-selection and direct-chat templates with employee routing." },
  { icon: Shuffle, t: "Assignment engine", d: "Fixed, round-robin, least-busy, manual and team-queue routing." },
  { icon: Wallet, t: "Deposit ledger", d: "Manual sales tracking with review, dispute, reversal and an append-only audit trail." },
  { icon: Phone, t: "Audio calling", d: "Real in-browser WebRTC audio calls with permissions per page." },
  { icon: CreditCard, t: "Seat-based billing", d: "Monthly & yearly plans in ₹ with UPI QR payment and approval." },
];

function SupportButton({ className, testid }: { className?: string; testid: string }) {
  const nav = useNavigate();
  const m = useMutation({
    mutationFn: () => apiPost<StartChatOut>("/public/support/start", {}),
    onSuccess: (r) => { beginSession(); if (r.conversation_id) nav(`/chat/${r.conversation_id}`); },
    onError: toastErr,
  });
  return <Button className={cn("gap-2", className)} disabled={m.isPending} onClick={() => m.mutate()} data-testid={testid}><Headphones className="h-4 w-4" />{m.isPending ? "Connecting…" : "Connect with Support Agent"}</Button>;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-3">
          <Logo />
          <nav className="ml-8 hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <Link to="/p/talksme/sales" className="hover:text-foreground" data-testid="home-nav-sample-page">Sample page</Link>
            <Link to="/chat" className="hover:text-foreground">Customer app</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <SupportButton testid="home-support-header-button" className="hidden sm:inline-flex" />
            <Link to="/demo" className={cn(buttonVariants(), "bg-brand text-white")} data-testid="home-open-demo-button">Open demo <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="bg-brand pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-25 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="animate-rise">
            <MockBadge label="Private & secure business chat" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700" />
            <h1 className="mt-5 font-heading text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              Every customer chat,<br /><span className="text-brand">every sale,</span> one CRM.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">talksme.in OmniChat brings WhatsApp-style messaging, multi-employee CRM, landing pages and a manual deposit ledger into one white-label platform — with a single app for your customers.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/demo" className={cn(buttonVariants({ size: "lg" }), "bg-brand h-12 px-6 text-white")} data-testid="home-hero-demo-button">Try the interactive demo</Link>
              <SupportButton testid="home-support-button" className="h-12 px-6" />
            </div>
            <div className="mt-10 flex flex-wrap gap-8 text-sm">
              {[["3", "demo orgs"], ["50", "conversations"], ["30", "deposits"], ["4", "role layers"]].map(([n, l]) => (
                <div key={l}><p className="font-heading text-3xl font-bold">{n}</p><p className="text-muted-foreground">{l}</p></div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-[28px] border bg-card/80 p-3 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3 border-b px-3 pb-3">
                <img src="https://i.pravatar.cc/200?img=47" alt="" className="h-10 w-10 rounded-full" />
                <div><p className="text-sm font-semibold">Priya Sharma</p><p className="text-xs text-emerald-600">online · Verified Employee</p></div>
                <Phone className="ml-auto h-4 w-4 text-muted-foreground" />
              </div>
              <div className="chat-wall space-y-2 rounded-2xl p-4">
                {[["in", "Hi! I saw your page — do you offer EMI?"], ["out", "Yes! 3, 6 and 12-month EMI is available 😊"], ["in", "Great, I've paid ₹12,000 via UPI."], ["out", "Recorded — our team will review it shortly."]].map(([d, t], i) => (
                  <div key={i} className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm animate-rise", d === "out" ? "ml-auto rounded-br-md bg-bubble-out text-bubble-out-foreground" : "rounded-bl-md bg-bubble-in")} style={{ animationDelay: `${i * 160}ms` }}>
                    {t}{d === "out" && <CheckCheck className="ml-1 inline h-3.5 w-3.5 text-sky-500" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-4 hidden rounded-2xl border bg-card p-4 shadow-xl sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Provisional deposits</p>
              <p className="font-heading text-2xl font-bold">₹4.7L</p>
              <p className="flex items-center gap-1 text-xs text-emerald-600"><BarChart3 className="h-3 w-3" /> 30 records · 10 reviewed</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 pb-24">
        <h2 className="font-heading text-3xl font-bold tracking-tight">Built for teams that sell in chat</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="lift rounded-2xl border bg-card p-6">
              <div className="bg-brand-subtle inline-flex rounded-xl p-2.5 text-primary"><f.icon className="h-5 w-5" /></div>
              <p className="mt-4 font-heading text-lg font-semibold">{f.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start gap-4 rounded-3xl border bg-[#0B1220] p-8 text-white sm:flex-row sm:items-center">
          <ShieldCheck className="h-10 w-10 text-sky-400" />
          <div className="flex-1"><p className="font-heading text-xl font-semibold">Tenant isolation & audited access by design</p><p className="text-sm text-slate-400">Role checks run on the server for every request. Super Admin support access needs step-up authentication and a recorded reason.</p></div>
          <Link to="/demo" className={cn(buttonVariants({ size: "lg" }), "bg-brand text-white")}>Explore roles</Link>
        </div>
      </section>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">© talksme.in · OmniChat CRM interactive preview</footer>
      <ContactFooter />
    </div>
  );
}
