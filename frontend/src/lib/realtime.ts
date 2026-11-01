import { appCtx } from "@/lib/api";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet } from "./api";
import { showLocalNotification } from "./pwa";
import { playMessageTone } from "./sound";

type Listener = (e: RTEvent) => void;
export interface RTEvent { type: string; conversation_id: string; action?: string; payload?: unknown; from_name?: string; from_avatar?: string; role?: string; sender_id?: string; ice?: unknown[] }

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();
export const onRealtime = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const wsSend = (msg: object) => { if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(msg)); return true; } return false; };
const typingAt = new Map<string, number>();
/** Conversations a Super Admin is silently watching (no notifications, participants are never told). */
export const watching = new Set<string>();
export const isTyping = (cid: string) => Date.now() - (typingAt.get(cid) ?? 0) < 4000;

/** One authenticated WebSocket per tab; reconnects with backoff. Messages invalidate the right queries instantly. */
export function useRealtime(me: { id: string; role: string; notify_sound: boolean } | null | undefined) {
  const enabled = !!me;
  const meRef = useRef(me);
  meRef.current = me;
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?ctx=${appCtx()}`);
      socket = ws;
      ws.onopen = () => { retry = 1000; sendVis(); qc.invalidateQueries({ queryKey: ["messages"] }); };
      ws.onmessage = (m) => {
        const e = JSON.parse(m.data) as RTEvent;
        if (e.type === "message") {
          qc.invalidateQueries({ queryKey: ["messages", e.conversation_id] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["conversation", e.conversation_id] });
          const u = meRef.current;
          const fromOther = !!e.sender_id && e.sender_id !== u?.id;
          if (fromOther && !watching.has(e.conversation_id) && u?.role !== "superadmin") {
            if (u?.notify_sound !== false) playMessageTone();
            const viewing = !document.hidden && (location.pathname + location.search).includes(e.conversation_id);
            if (!viewing) {
              apiGet<{ customer_name: string; org_name: string; employee_name: string; last_message: string; muted: boolean }>(`/conversations/${e.conversation_id}`)
                .then((c) => {
                  if (c.muted) return;
                  const customer = u?.role === "customer";
                  const title = customer ? `${c.employee_name || c.org_name} · ${c.org_name}` : c.customer_name;
                  const url = customer ? `/chat/${e.conversation_id}` : u?.role === "admin" ? `/admin/conversations` : `/employee/inbox?c=${e.conversation_id}`;
                  if (document.hidden) showLocalNotification(title, c.last_message, url, `msg-${e.conversation_id}`);
                  else toast(title, { description: c.last_message, action: { label: "Open", onClick: () => { location.href = url; } } });
                }).catch(() => undefined);
            }
          }
        }
        if (e.type === "new_chat" && meRef.current && meRef.current.role !== "customer" && meRef.current.role !== "superadmin") {
          // a new customer just arrived: loud ping + toast (and a system notification when the tab is in the background)
          qc.invalidateQueries({ queryKey: ["conversations"] });
          playMessageTone(); setTimeout(playMessageTone, 350);
          const url = meRef.current.role === "admin" ? "/admin/conversations" : `/employee/inbox?c=${e.conversation_id}`;
          if (document.hidden) showLocalNotification(`🆕 New customer · ${e.from_name ?? ""}`, "Started a chat. Reply now!", url, `new-${e.conversation_id}`, true);
          toast.success(`🆕 New customer: ${e.from_name ?? "Guest"}`, { description: "Just started a chat. Reply fast to win the lead!", duration: 12000, action: { label: "Open chat", onClick: () => { location.href = url; } } });
        }
        if (e.type === "recharge" && meRef.current && meRef.current.role !== "customer") {
          qc.invalidateQueries({ queryKey: ["recharges"] });
          playMessageTone(); setTimeout(playMessageTone, 300); setTimeout(playMessageTone, 600);
          const url = meRef.current.role === "admin" ? "/admin/recharges" : "/employee/recharges";
          const p = (e.payload ?? {}) as { amount?: number; service?: string };
          if (document.hidden) showLocalNotification(`💳 New payment ₹${p.amount ?? ""} · ${e.from_name ?? ""}`, `${p.service ?? ""}: verify and send the ID`, url, `rch-${Date.now()}`, true);
          toast.success(`💳 New payment ₹${p.amount ?? ""} from ${e.from_name ?? "customer"}`, { description: `${p.service ?? ""}: verify the screenshot`, duration: 15000, action: { label: "Verify", onClick: () => { location.href = url; } } });
        }
        if (e.type === "typing") { typingAt.set(e.conversation_id, Date.now()); qc.invalidateQueries({ queryKey: ["typing", e.conversation_id] }); }
        listeners.forEach((l) => l(e));
      };
      ws.onclose = () => { if (socket === ws) socket = null; if (!stop) timer = setTimeout(connect, (retry = Math.min(retry * 2, 15000))); };
    };
    const sendVis = () => wsSend({ type: "visibility", visible: document.visibilityState === "visible" });
    document.addEventListener("visibilitychange", sendVis);
    connect();
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", sendVis); socket?.close(); socket = null; };
  }, [enabled, me?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps
}
