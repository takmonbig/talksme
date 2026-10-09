import { useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Download, MoreVertical, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enableNotifications, isIOS, useInstallPrompt, useNotificationPermission } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/** Step-by-step install guide (shown when the browser can't open its own install prompt, e.g. iPhone Safari). */
export function InstallHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const ios = isIOS();
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm"><span className="bg-brand flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{n}</span><span>{children}</span></li>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="install-help-dialog">
        <DialogHeader>
          <DialogTitle>Install the talksme.in app</DialogTitle>
          <DialogDescription>Free, about 1 MB, no Play Store needed. You get all your chats, replies and call alerts in one app.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2">
          {ios ? (
            <>
              <Step n={1}>Open this page in <b>Safari</b>.</Step>
              <Step n={2}>Tap the <Share className="inline h-4 w-4" /> <b>Share</b> button at the bottom.</Step>
              <Step n={3}>Choose <SquarePlus className="inline h-4 w-4" /> <b>Add to Home Screen</b>, then tap <b>Add</b>.</Step>
              <Step n={4}>Open <b>talksme</b> from your home screen and tap <b>Enable notifications</b>.</Step>
            </>
          ) : (
            <>
              <Step n={1}>Tap the <MoreVertical className="inline h-4 w-4" /> <b>menu</b> (top-right in Chrome).</Step>
              <Step n={2}>Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</Step>
              <Step n={3}>Open <b>talksme</b> from your home screen. Your chats are already there.</Step>
              <Step n={4}>Tap <b>Enable notifications</b> so you hear new messages and calls.</Step>
            </>
          )}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** Permanent slim "DOWNLOAD NOW" strip (hidden once the app is installed / opened as the app). */
export function InstallBanner({ className, testid = "install-app-banner" }: { className?: string; testid?: string }) {
  const install = useInstallPrompt();
  const [help, setHelp] = useState(false);
  if (install.installed) return null;
  const go = async () => { if (install.canInstall) { if (await install.prompt()) toast.success("App installed. Open talksme from your home screen"); } else setHelp(true); };
  return (
    <>
      <button onClick={go} data-testid={testid}
        className={cn("group mx-2 my-1.5 flex w-[calc(100%-1rem)] shrink-0 items-center gap-2.5 rounded-xl border border-amber-400/60 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-2.5 py-1.5 text-left shadow-md transition-transform duration-150 active:scale-[0.98]", className)}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-400/70 text-amber-300"><Download className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[13px] font-extrabold tracking-wide text-amber-300">INSTALL APP NOW</span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-amber-100/80">For all updates & messages, free</span>
        </span>
        <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950">Install</span>
      </button>
      <InstallHelpDialog open={help} onOpenChange={setHelp} />
    </>
  );
}

/** Small header pill version. */
export function InstallPill() {
  const install = useInstallPrompt();
  const [help, setHelp] = useState(false);
  if (install.installed) return null;
  return (
    <>
      <Button size="sm" className="bg-brand h-7 shrink-0 px-2 text-[11px] text-white" onClick={async () => { if (!(install.canInstall && (await install.prompt()))) if (!install.canInstall) setHelp(true); }} data-testid="download-app-button">
        <Download className="h-3.5 w-3.5" /> Install app
      </Button>
      <InstallHelpDialog open={help} onOpenChange={setHelp} />
    </>
  );
}

/** Shown until notifications are allowed. Notifications are required so customers and employees never miss messages or calls. */
export function NotifyBanner({ who, className, compact }: { who: "customer" | "employee"; className?: string; compact?: boolean }) {
  const perm = useNotificationPermission();
  const [hidden, setHidden] = useState(false);
  if (perm === "granted" || hidden) return null;
  if (perm === "unsupported") {
    if (!isIOS()) return null;
    return (
      <div className={cn("mx-2 mb-1.5 flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200", className)} data-testid="notify-ios-hint">
        <BellRing className="h-4 w-4 shrink-0" /> <span className="flex-1">On iPhone, notifications work after you <b>install the app</b> (Share, then Add to Home Screen).</span>
        <button onClick={() => setHidden(true)} aria-label="Hide"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  const denied = perm === "denied";
  const text = who === "customer" ? "Turn on notifications to hear replies and incoming calls" : "Turn on notifications so you never miss a customer message or call";
  return (
    <div className={cn("mx-2 mb-1.5 flex items-center gap-2 rounded-xl border px-3 text-xs shadow-sm", compact ? "py-1.5" : "py-2", denied ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-foreground", className)} data-testid="enable-notifications-banner">
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bell className="h-3.5 w-3.5 animate-[wiggle_1.6s_ease-in-out_infinite]" />
        {!denied && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />}
      </span>
      <span className="min-w-0 flex-1 font-medium leading-snug">{denied ? <>Notifications are blocked. Tap the 🔒 lock icon in the address bar, then <b>Notifications</b>, then <b>Allow</b>.</> : text}</span>
      {!denied && (
        <Button size="sm" className="h-7 shrink-0 px-3 text-xs" data-testid="enable-notifications-button"
          onClick={async () => { const p = await enableNotifications(); if (p === "granted") toast.success("Notifications enabled with sound"); else if (p === "denied") toast.error("Notifications were blocked. Allow them in browser settings"); }}>
          Enable
        </Button>
      )}
    </div>
  );
}
