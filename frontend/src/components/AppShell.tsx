import { useState, type CSSProperties } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3, Building2, CreditCard, FileClock, Globe, Inbox, LayoutDashboard, LayoutTemplate, LogOut, Megaphone, Menu,
  MessagesSquare, RotateCcw, Settings, ShieldCheck, Users, Wallet, Contact, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, Logo, Skeleton, ThemeToggle, VerifiedBadge } from "@/components/common";
import { apiPost } from "@/lib/api";
import { HOME_BY_ROLE, toastErr, useMe, useStaffOrg } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import type { Ok, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Inbox; end?: boolean; feature?: string };
const NAV: Record<Exclude<Role, "customer">, NavItem[]> = {
  employee: [
    { to: "/employee", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/employee/inbox", label: "Inbox", icon: MessagesSquare },
    { to: "/employee/customers", label: "Customers", icon: Contact },
    { to: "/employee/deposits", label: "Deposits", icon: Wallet, feature: "deposits" },
    { to: "/employee/analytics", label: "Analytics", icon: BarChart3, feature: "advanced_analytics" },
    { to: "/employee/settings", label: "Settings", icon: Settings },
  ],
  admin: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/conversations", label: "Conversations", icon: MessagesSquare },
    { to: "/admin/employees", label: "Employees", icon: Users },
    { to: "/admin/customers", label: "Customers", icon: Contact },
    { to: "/admin/landing-pages", label: "Landing pages", icon: LayoutTemplate, feature: "landing_builder" },
    { to: "/admin/deposits", label: "Deposit ledger", icon: Wallet, feature: "deposits" },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3, feature: "advanced_analytics" },
    { to: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone, feature: "broadcasts" },
    { to: "/admin/billing", label: "Billing", icon: CreditCard },
    { to: "/admin/settings", label: "Settings", icon: Settings },
  ],
  superadmin: [
    { to: "/superadmin", label: "Command center", icon: LayoutDashboard, end: true },
    { to: "/superadmin/organizations", label: "Organizations", icon: Building2 },
    { to: "/superadmin/customers", label: "Customer explorer", icon: Contact },
    { to: "/superadmin/admins", label: "Admins", icon: ShieldCheck },
    { to: "/superadmin/subscriptions", label: "Subscriptions", icon: Layers },
    { to: "/superadmin/domains", label: "Domains", icon: Globe },
    { to: "/superadmin/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/superadmin/audit-logs", label: "Audit logs", icon: FileClock },
    { to: "/superadmin/settings", label: "Platform settings", icon: Settings },
  ],
};

export function ResetDemoButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => apiPost<Ok>("/demo/reset"),
    onSuccess: async () => { toast.success("Demo data reset"); await endSession("/demo"); },
    onError: toastErr,
  });
  return (
    <>
      <Button variant="outline" size={compact ? "icon-sm" : "sm"} onClick={() => setOpen(true)} data-testid="reset-demo-button" aria-label="Reset demo">
        <RotateCcw className="h-4 w-4" />{!compact && <span>Reset demo</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset demo data?</DialogTitle>
            <DialogDescription>All organizations, chats, deposits and settings return to the seeded demo state. You'll be signed out.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="reset-demo-cancel">Cancel</Button>
            <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending} data-testid="reset-demo-confirm">
              {m.isPending ? "Resetting…" : "Reset everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SideNav({ items, onNav }: { items: NavItem[]; onNav?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} onClick={onNav}
          data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
          className={({ isActive }) => cn("group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
            isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          {({ isActive }) => (
            <>
              {isActive && <span className="bg-brand absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full" />}
              <it.icon className="h-4 w-4" />{it.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Guards a role area. The backend enforces the same roles on every endpoint; this only routes the UI. */
export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isLoading) return <div className="p-8"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64" /></div>;
  if (me.isError || !me.data) return <Navigate to={`/demo?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (me.data.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm" data-testid="access-denied">
          <ShieldCheck className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-3 text-xl font-bold">Access denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">You're signed in as <b>{me.data.role}</b>. This area requires the <b>{role}</b> role.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link to={HOME_BY_ROLE[me.data.role]}><Button data-testid="go-home-button">Go to my workspace</Button></Link>
            <Button variant="outline" onClick={() => endSession("/demo")} data-testid="switch-account-button">Switch account</Button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function AppShell({ role }: { role: Exclude<Role, "customer"> }) {
  const me = useMe();
  const org = useStaffOrg(role !== "superadmin" && !!me.data);
  const [open, setOpen] = useState(false);
  const items = NAV[role].filter((i) => !i.feature || org.data?.features?.[i.feature] !== false);
  const brandStyle = org.data ? ({ "--primary": org.data.primary_color, "--sidebar-accent-foreground": org.data.primary_color } as CSSProperties) : undefined;
  const roleLabel = { employee: "Employee", admin: "Admin", superadmin: "Super Admin" }[role];

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/" className="px-1"><Logo /></Link>
      <div className="rounded-xl border bg-brand-subtle p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{roleLabel} workspace</p>
        <p className="mt-0.5 truncate text-sm font-semibold" data-testid="workspace-org-name">{role === "superadmin" ? "Platform — all tenants" : org.data?.name ?? "…"}</p>
      </div>
      <SideNav items={items} onNav={() => setOpen(false)} />
      <div className="mt-auto rounded-xl border p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mb-1 h-4 w-4 text-emerald-500" />Your chats and customer data are private &amp; secure — encrypted in transit and isolated per organization.
      </div>
    </div>
  );

  return (
    <RequireRole role={role}>
      <div className="flex min-h-screen bg-background" style={brandStyle}>
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar lg:block">{sidebar}</aside>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{sidebar}</SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl sm:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-nav-button"><Menu className="h-5 w-5" /></Button>
            <div className="lg:hidden"><Logo compact /></div>
            <div className="ml-auto flex items-center gap-1.5">
              <ResetDemoButton compact />
              <ThemeToggle />
              {me.data && (
                <div className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3" data-testid="header-user">
                  <Avatar name={me.data.name} src={me.data.avatar} size={28} status={role === "employee" ? me.data.status : undefined} />
                  <div className="hidden leading-tight sm:block">
                    <p className="text-xs font-semibold">{me.data.name}</p>
                    {role === "employee" && me.data.verified ? <VerifiedBadge /> : <p className="text-[10px] text-muted-foreground">{roleLabel}</p>}
                  </div>
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={() => endSession("/demo")} aria-label="Sign out" data-testid="logout-button"><LogOut className="h-4 w-4" /></Button>
            </div>
          </header>
          <main className="min-w-0 flex-1 p-3 sm:p-6"><Outlet /></main>
        </div>
      </div>
    </RequireRole>
  );
}
