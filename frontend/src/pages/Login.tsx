import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Headset, MessageCircle, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo, MockBadge, ThemeToggle } from "@/components/common";
import { apiPost } from "@/lib/api";
import { HOME_BY_ROLE, errMsg } from "@/lib/hooks";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLES = [
  { key: "customer", label: "Customer", email: "customer@talksme.in", icon: MessageCircle, text: "Universal PWA inbox — chats with 3 businesses." },
  { key: "employee", label: "Employee", email: "agent@talksme.in", icon: Headset, text: "WhatsApp-style workspace, CRM, deposits, transfers." },
  { key: "admin", label: "Admin", email: "admin@talksme.in", icon: Building2, text: "Org dashboard, landing builder, approvals, billing." },
  { key: "superadmin", label: "Super Admin", email: "superadmin@talksme.in", icon: ShieldCheck, text: "Platform command center across all tenants." },
];

export default function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<User>("/auth/login", { email, password }),
    onSuccess: (u) => {
      beginSession();
      qc.setQueryData(["me"], u);
      const next = params.get("next");
      nav(next && next.startsWith(HOME_BY_ROLE[u.role]) ? next : HOME_BY_ROLE[u.role]);
    },
    onError: (e) => setError(errMsg(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address");
    if (!password) return setError("Enter your password");
    m.mutate();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="bg-brand pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-violet-500/20 blur-3xl" />
      <header className="relative flex items-center justify-between px-5 py-4 sm:px-10">
        <Link to="/"><Logo /></Link><ThemeToggle />
      </header>
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 sm:px-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <MockBadge label="Interactive preview · seeded demo data" />
          <h1 className="mt-4 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">Pick a role.<br /><span className="text-brand">Explore every workflow.</span></h1>
          <p className="mt-3 max-w-lg text-muted-foreground">Each role has real email/password login and server-enforced permissions. Click a card to fill its demo credentials — password for all: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">Demo@123</code></p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button key={r.key} onClick={() => { setEmail(r.email); setPassword("Demo@123"); setError(""); }} data-testid={`role-card-${r.key}`}
                className={cn("lift group rounded-2xl border bg-card p-5 text-left shadow-sm", email === r.email && "border-primary ring-2 ring-primary/20")}>
                <div className="flex items-center justify-between">
                  <div className="bg-brand rounded-xl p-2.5 text-white"><r.icon className="h-5 w-5" /></div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                </div>
                <p className="mt-4 font-heading text-lg font-bold">Enter as {r.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
                <p className="mt-3 font-mono text-xs text-primary">{r.email}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="lg:pt-16">
          <form onSubmit={submit} className="rounded-3xl border bg-card/80 p-6 shadow-xl backdrop-blur-xl sm:p-8" data-testid="login-form">
            <h2 className="font-heading text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sessions use secure httpOnly cookies and expire after 12 hours.</p>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" data-testid="login-email-input" /></div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <div className="relative">
                  <Input id="pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" data-testid="login-toggle-password">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="login-error">{error}</p>}
              <Button type="submit" className="bg-brand h-11 w-full text-white" disabled={m.isPending} data-testid="login-submit-button">{m.isPending ? "Signing in…" : "Sign in"}</Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">Visiting as a new customer? Open a business page like <Link to="/p/talksme/sales" className="font-medium text-primary underline" data-testid="login-sample-landing-link">/p/talksme/sales</Link> and tap Chat Now.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
