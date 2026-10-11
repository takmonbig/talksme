import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/common";
import { apiGet, apiPost } from "@/lib/api";
import { onRealtime, wsSend } from "@/lib/realtime";
import { showLocalNotification } from "@/lib/pwa";
import { startRing, stopRing } from "@/lib/sound";

type Phase = "idle" | "ringing" | "incoming" | "connecting" | "connected";
interface Peer { cid: string; name: string; avatar?: string }
interface AgoraJoin { app_id: string; channel: string; uid: number; token: string | null }
type Agora = typeof import("agora-rtc-sdk-ng").default;
type Client = import("agora-rtc-sdk-ng").IAgoraRTCClient;
type MicTrack = import("agora-rtc-sdk-ng").IMicrophoneAudioTrack;

let agora: Agora | null = null;
const loadAgora = async () => {
  if (!agora) {
    agora = (await import("agora-rtc-sdk-ng")).default;
    agora.setLogLevel(3); // warnings+errors only
    agora.disableLogUpload();
  }
  return agora;
};

let startFn: ((p: Peer) => void) | null = null;
export const startCall = (p: Peer) => startFn?.(p);

/** Voice calls: ring/accept/reject/end are signalled over our authenticated WebSocket; the audio itself runs on Agora RTC. */
export function CallManager() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState<Peer | null>(null);
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const client = useRef<Client | null>(null);
  const mic = useRef<MicTrack | null>(null);
  const caller = useRef(false);
  const st = useRef({ phase, peer, secs });
  st.current = { phase, peer, secs };

  const log = (status: string, duration = 0) => {
    const p = st.current.peer;
    if (!p || !caller.current) return;
    apiPost(`/conversations/${p.cid}/calls`, { status, duration }).then(() => qc.invalidateQueries({ queryKey: ["messages", p.cid] })).catch(() => undefined);
  };
  const cleanup = () => {
    const c = client.current, m = mic.current;
    client.current = null; mic.current = null;
    m?.stop(); m?.close();
    c?.removeAllListeners(); c?.leave().catch(() => undefined);
    setPhase("idle"); setPeer(null); setSecs(0); setMuted(false);
  };
  const signal = (action: string, payload?: unknown) => st.current.peer && wsSend({ type: "call", conversation_id: st.current.peer.cid, action, payload });

  /** Join the conversation's Agora channel and publish the microphone. */
  const joinAudio = async (cid: string) => {
    const [AgoraRTC, cfg] = await Promise.all([loadAgora(), apiGet<AgoraJoin>(`/calls/${cid}/agora`)]);
    let track: MicTrack | null = null;
    try {
      track = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
    } catch (err) {
      const msg = String((err as { code?: string; message?: string }).code ?? (err as Error).message);
      if (/PERMISSION|NotAllowed/i.test(msg)) { toast.error("Microphone access is blocked. Allow the microphone for this site to call."); throw err; }
      toast.warning("No microphone found. You can listen, but the other person won't hear you.");
    }
    const c = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    client.current = c; mic.current = track;
    c.on("user-published", async (u, type) => {
      if (type !== "audio" || client.current !== c) return;
      await c.subscribe(u, "audio");
      u.audioTrack?.play();
      setPhase("connected");
    });
    c.on("user-joined", () => { if (client.current === c) setPhase("connected"); }); // both sides are in the call
    c.on("user-left", () => {
      if (client.current !== c) return;
      toast("Call ended"); log("completed", st.current.secs); cleanup();
    });
    c.on("connection-state-change", (cur, _prev, reason) => {
      if (client.current === c && cur === "DISCONNECTED" && reason !== "LEAVE") { toast.error("Call connection lost"); signal("end"); log("failed", st.current.secs); cleanup(); }
    });
    try {
      await c.join(cfg.app_id, cfg.channel, cfg.token, cfg.uid);
    } catch (err) {
      const code = String((err as { code?: string }).code ?? "");
      toast.error(/GATEWAY|TOKEN|KEY|APP_ID/i.test(code) ? "The voice call service rejected the connection (Agora setup). Please contact support." : "Couldn't connect the call. Check your internet and try again.");
      throw err;
    }
    if (client.current !== c) { c.leave().catch(() => undefined); return; }
    if (track) await c.publish(track);
  };

  useEffect(() => {
    startFn = async (p) => {
      if (st.current.phase !== "idle") return;
      caller.current = true; setPeer(p); st.current.peer = p; setPhase("ringing");
      try {
        await joinAudio(p.cid); // caller waits in the channel so audio starts the moment the other side accepts
        if ((st.current.phase as Phase) === "ringing") signal("offer");
      } catch { cleanup(); }
    };
    const off = onRealtime(async (e) => {
      if (e.type !== "call") return;
      const cur = st.current;
      if (e.action === "not_allowed") { toast.error("Calling isn't enabled for this chat. Please send a message instead."); cleanup(); return; }
      if (e.action === "offer") {
        if (cur.phase !== "idle") { if (cur.peer?.cid !== e.conversation_id) wsSend({ type: "call", conversation_id: e.conversation_id, action: "busy" }); return; }
        caller.current = false;
        setPeer({ cid: e.conversation_id, name: e.from_name ?? "Caller", avatar: e.from_avatar }); setPhase("incoming");
        return;
      }
      if (!cur.peer || cur.peer.cid !== e.conversation_id) return;
      if (e.action === "answer") {
        if (cur.phase === "ringing") setPhase("connecting");
      } else if (e.action === "reject" || e.action === "busy") {
        toast(e.action === "busy" ? `${cur.peer.name} is on another call` : `${cur.peer.name} declined the call`); log(e.action === "busy" ? "busy" : "rejected"); cleanup();
      } else if (e.action === "end") {
        toast(cur.phase === "incoming" ? `Missed call from ${cur.peer.name}` : "Call ended"); log(cur.phase === "connected" ? "completed" : cur.phase === "connecting" ? "failed" : "missed", cur.secs); cleanup();
      }
    });
    return () => { off(); startFn = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ringtone / ringback + system notification for incoming calls (so a backgrounded tab still alerts).
  useEffect(() => {
    if (phase === "incoming") {
      startRing("incoming");
      const p = st.current.peer;
      if (p && document.hidden) showLocalNotification(`📞 Incoming call · ${p.name}`, "Tap to answer the audio call", location.pathname.startsWith("/employee") ? `/employee/inbox?c=${p.cid}` : `/chat/${p.cid}`, `call-${p.cid}`, true);
    } else if (phase === "ringing") startRing("outgoing");
    else stopRing();
    return () => stopRing();
  }, [phase]);

  useEffect(() => {
    if (phase === "connecting") {
      const t = setTimeout(() => {
        if (st.current.phase !== "connecting") return;
        toast.error("Couldn't connect the audio. Please check your internet and try again.");
        signal("end"); log("failed"); cleanup();
      }, 25000);
      return () => clearTimeout(t);
    }
    if (phase === "connected") { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }
    if (phase === "ringing" || phase === "incoming") {
      const t = setTimeout(() => { if (st.current.phase === phase) { signal("end"); if (phase === "ringing") toast("No answer"); log("missed"); cleanup(); } }, 35000);
      return () => clearTimeout(t);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { mic.current?.setEnabled(!muted).catch(() => undefined); }, [muted]);

  const accept = async () => {
    const p = st.current.peer;
    if (!p) return;
    try {
      setPhase("connecting");
      await joinAudio(p.cid);
      signal("answer");
    } catch { signal("reject"); cleanup(); }
  };
  const hangup = () => { signal(phase === "incoming" ? "reject" : "end"); log(phase === "connected" ? "completed" : phase === "connecting" ? "failed" : "missed", secs); cleanup(); };
  const fmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <>
      <Dialog open={phase !== "idle"} onOpenChange={(o) => !o && hangup()}>
        <DialogContent showCloseButton={false} className="overflow-hidden border-0 p-0 sm:max-w-sm" data-testid="call-modal">
          <div className="bg-[#0B1220] p-8 text-center text-white">
            <DialogTitle className="sr-only">Audio call</DialogTitle>
            <p className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Lock className="h-3 w-3" /> Secure HD voice call</p>
            <div className="relative mx-auto mt-6 h-24 w-24">
              {phase !== "connected" && <span className="animate-pulse-ring absolute inset-0 rounded-full bg-sky-400/40" />}
              <div className="relative"><Avatar name={peer?.name ?? "?"} src={peer?.avatar} size={96} /></div>
            </div>
            <p className="mt-4 font-heading text-xl font-semibold">{peer?.name}</p>
            <p className="mt-1 text-sm text-slate-400" data-testid="call-status">
              {phase === "incoming" ? "Incoming audio call…" : phase === "ringing" ? "Ringing…" : phase === "connecting" ? "Connecting…" : `Connected · ${fmt}`}
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              {phase === "incoming" ? (
                <>
                  <Button size="icon-lg" className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600" onClick={hangup} data-testid="call-reject-button"><PhoneOff /></Button>
                  <Button size="icon-lg" className="h-14 w-14 rounded-full bg-emerald-500 hover:bg-emerald-600" onClick={accept} data-testid="call-accept-button"><PhoneIncoming /></Button>
                </>
              ) : (
                <>
                  <Button size="icon-lg" variant="secondary" className="h-14 w-14 rounded-full" onClick={() => setMuted((m) => !m)} disabled={phase !== "connected"} data-testid="call-mute-button">{muted ? <MicOff /> : <Mic />}</Button>
                  <Button size="icon-lg" className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600" onClick={hangup} data-testid="call-end-button"><PhoneOff /></Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CallButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} title={disabled ? "Audio calls are disabled here" : "Start audio call"} data-testid="chat-call-button">
      <Phone className="h-4 w-4" />
    </Button>
  );
}
