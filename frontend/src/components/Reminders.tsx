import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BackupPhoneDialog } from "@/components/chat/BackupPhone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { enableNotifications, isIOS, notifSupported, syncPushSubscription, useNotificationPermission } from "@/lib/pwa";
import { onRealtime } from "@/lib/realtime";
import { useCallActive } from "@/lib/callState";
import type { PendingNotifyReminder, PushTestOut, User } from "@/lib/types";

const FIVE_MIN = 5 * 60 * 1000;

/** After enabling: send a real push to this device so the user knows it works (and we learn if it doesn't). */
export async function sendTestPush() {
  const r = await apiPost<PushTestOut>("/push/test").catch(() => null);
  if (!r) return;
  if (r.delivered) toast.success("Test notification sent. You should see it now 🔔");
  else if (!r.devices) toast.warning("This device isn't registered for push yet. Open the app from your home screen and try again.");
  else toast.error("The push service rejected the notification. Please re-enable notifications.");
}

/** Admin-triggered "turn on notifications" popup. Pending reminder is stored server-side so offline users see it on next open; a realtime event shows it instantly. */
export function AdminNotifyReminderPopup({ me }: { me: User }) {
  const inCall = useCallActive();
  const qc = useQueryClient();
  const perm = useNotificationPermission();
  const q = useQuery({ queryKey: ["notify-reminder", me.id], queryFn: () => apiGet<PendingNotifyReminder | null>("/me/notify-reminder") });
  useEffect(() => onRealtime((e) => { if (e.type === "notify_reminder") qc.invalidateQueries({ queryKey: ["notify-reminder", me.id] }); }), [qc, me.id]);
  const close = async () => { qc.setQueryData(["notify-reminder", me.id], null); await apiPost("/me/notify-reminder/ack").catch(() => undefined); };
  const r = q.data;
  const enable = async () => {
    const p = perm === "granted" ? "granted" : await enableNotifications();
    if (p === "granted") { await syncPushSubscription(); await sendTestPush(); await close(); }
    else if (p === "denied") toast.error("Blocked. Tap the 🔒 lock icon in the address bar, then Notifications, then Allow");
  };
  return (
    <Dialog open={!!r && !inCall} onOpenChange={(o) => !o && void close()}>
      <DialogContent className="sm:max-w-sm" data-testid="admin-notify-reminder-dialog">
        <DialogHeader className="items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><BellRing className="h-7 w-7 animate-[wiggle_1.6s_ease-in-out_infinite]" /></span>
          <DialogTitle>{r?.org_name || "Your team"} asks you to turn on notifications</DialogTitle>
          <DialogDescription>{me.role === "customer" ? "So you never miss a reply or call from the team, even when the app is closed." : `${r?.from_name ?? "Your admin"} wants to make sure you never miss a customer message or call.`}</DialogDescription>
        </DialogHeader>
        {!notifSupported() ? <p className="rounded-xl bg-muted p-3 text-sm">On iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>. Open the app from your home screen and turn on notifications there.</p>
          : <Button size="lg" className="w-full" onClick={enable} data-testid="admin-notify-reminder-enable">{perm === "granted" ? "Reconnect this device" : "Enable notifications"}</Button>}
        <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => void close()} data-testid="admin-notify-reminder-dismiss">Not now</button>
      </DialogContent>
    </Dialog>
  );
}

/** Notifications are essential: until allowed, ask again every 5 minutes (customers + staff). Never re-prompts the browser after a denial; shows unblock steps instead. */
export function NotificationReminder({ me }: { me: User }) {
  const inCall = useCallActive();
  const perm = useNotificationPermission();
  const [open, setOpen] = useState(false);
  const needs = me.role !== "superadmin" && perm !== "granted" && (perm !== "unsupported" || isIOS());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!needs) { setOpen(false); return; }
    const due = () => Number(sessionStorage.getItem("notify-reminder-at") || 0) + FIVE_MIN;
    const t = setTimeout(() => {
      // the first-visit intro (or another prompt) may have pushed the reminder back while we waited
      if (Date.now() < due() || document.querySelector("[data-testid=intro-video-overlay],[data-testid=intro-install-dialog],[data-testid=intro-notify-dialog]")) setTick((x) => x + 1);
      else setOpen(true);
    }, Math.max(5000, due() - Date.now()));
    return () => clearTimeout(t);
  }, [needs, open, tick]);
  const close = () => { sessionStorage.setItem("notify-reminder-at", String(Date.now())); setOpen(false); };
  const denied = perm === "denied";
  return (
    <Dialog open={open && needs && !inCall} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-sm" data-testid="notify-reminder-dialog">
        <DialogHeader className="items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><BellRing className="h-7 w-7 animate-[wiggle_1.6s_ease-in-out_infinite]" /></span>
          <DialogTitle>{denied ? "Notifications are blocked" : "Turn on notifications"}</DialogTitle>
          <DialogDescription>{me.role === "customer" ? "Get instant alerts when the team replies or calls you, even when the app is closed." : "Never miss a customer message or call. Customers expect fast replies."}</DialogDescription>
        </DialogHeader>
        {!notifSupported() ? (
          <p className="rounded-xl bg-muted p-3 text-sm">On iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>. Open the app from your home screen and turn on notifications there.</p>
        ) : denied ? (
          <ol className="list-decimal space-y-1 rounded-xl bg-muted p-3 pl-7 text-sm" data-testid="notify-unblock-steps">
            <li>Tap the 🔒 lock icon (or ⋮ → Site settings) in the address bar.</li><li>Open <b>Notifications</b> and choose <b>Allow</b>.</li><li>Reload this page.</li>
          </ol>
        ) : (
          <Button size="lg" className="w-full" data-testid="notify-reminder-enable" onClick={async () => { const p = await enableNotifications(); close(); if (p === "granted") await sendTestPush(); else if (p === "denied") toast.error("Blocked. Follow the steps to allow notifications"); }}>Enable notifications</Button>
        )}
        <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={close} data-testid="notify-reminder-later">Remind me in 5 minutes</button>
      </DialogContent>
    </Dialog>
  );
}

/** Customers without a WhatsApp backup number are asked once a day (optional). */
export function DailyBackupPhonePrompt({ me }: { me: User }) {
  const inCall = useCallActive();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (me.role !== "customer" || me.phone) return;
    const key = `backup-ask-${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    // wait until no other popup (intro video, install/notification prompts) is on screen
    const t = setInterval(() => {
      if (sessionStorage.getItem("intro-session") || document.querySelector("[role=dialog],[data-testid=intro-video-overlay]") || (location.pathname.startsWith("/chat/") && !localStorage.getItem("talksme-intro-done"))) return;
      clearInterval(t); localStorage.setItem(key, "1"); setOpen(true);
    }, 2500);
    return () => clearInterval(t);
  }, [me.role, me.phone]);
  return <BackupPhoneDialog open={open && !inCall} onOpenChange={setOpen} />;
}
