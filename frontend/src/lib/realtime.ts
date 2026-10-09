import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";

type Listener = (e: RTEvent) => void;
export interface RTEvent { type: string; conversation_id: string; action?: string; payload?: unknown; from_name?: string; from_avatar?: string; role?: string }

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();
export const onRealtime = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const wsSend = (msg: object) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg)); };
const typingAt = new Map<string, number>();
/** Conversations a Super Admin is silently watching (no notifications, participants are never told). */
export const watching = new Set<string>();
export const isTyping = (cid: string) => Date.now() - (typingAt.get(cid) ?? 0) < 4000;

/** One authenticated WebSocket per tab; reconnects with backoff. Messages invalidate the right queries instantly. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      socket = ws;
      ws.onopen = () => { retry = 1000; qc.invalidateQueries({ queryKey: ["messages"] }); };
      ws.onmessage = (m) => {
        const e = JSON.parse(m.data) as RTEvent;
        if (e.type === "message") {
          qc.invalidateQueries({ queryKey: ["messages", e.conversation_id] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["conversation", e.conversation_id] });
          if (!watching.has(e.conversation_id) && document.hidden && "Notification" in window && Notification.permission === "granted") {
            apiGet<{ customer_name: string; org_name: string; last_message: string }>(`/conversations/${e.conversation_id}`)
              .then((c) => new Notification(c.org_name, { body: c.last_message, icon: "/apple-touch-icon.png" })).catch(() => undefined);
          }
        }
        if (e.type === "typing") { typingAt.set(e.conversation_id, Date.now()); qc.invalidateQueries({ queryKey: ["typing", e.conversation_id] }); }
        listeners.forEach((l) => l(e));
      };
      ws.onclose = () => { if (socket === ws) socket = null; if (!stop) timer = setTimeout(connect, (retry = Math.min(retry * 2, 15000))); };
    };
    connect();
    return () => { stop = true; clearTimeout(timer); socket?.close(); socket = null; };
  }, [enabled, qc]);
}
