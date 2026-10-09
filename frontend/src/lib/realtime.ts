import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";
import { showLocalNotification } from "./pwa";
import { playMessageTone } from "./sound";

type Listener = (e: RTEvent) => void;
export interface RTEvent { type: string; conversation_id: string; action?: string; payload?: unknown; from_name?: string; from_avatar?: string; role?: string; sender_id?: string; ice?: unknown[] }

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();
export const onRealtime = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const wsSend = (msg: object) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg)); };
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
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
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
            if (document.hidden) {
              apiGet<{ customer_name: string; org_name: string; employee_name: string; last_message: string; muted: boolean }>(`/conversations/${e.conversation_id}`)
                .then((c) => {
                  if (c.muted) return;
                  const customer = u?.role === "customer";
                  showLocalNotification(customer ? `${c.employee_name || c.org_name} · ${c.org_name}` : c.customer_name, c.last_message,
                    customer ? `/chat/${e.conversation_id}` : `/employee/inbox?c=${e.conversation_id}`, `msg-${e.conversation_id}`);
                }).catch(() => undefined);
            }
          }
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
