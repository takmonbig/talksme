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
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
/** STUN + TURN relay (Metered) from the backend, so calls connect on mobile data / strict Wi-Fi too. */
const iceConfig = async (): Promise<RTCConfiguration> => {
  const r = await apiGet<{ ice_servers: RTCIceServer[]; turn: boolean }>("/calls/ice-servers").catch(() => null);
  return { iceServers: r?.ice_servers?.length ? r.ice_servers : FALLBACK_ICE };
};

let startFn: ((p: Peer) => void) | null = null;
export const startCall = (p: Peer) => startFn?.(p);

/** Real WebRTC audio calls, signaled over the authenticated WebSocket. Mounted once per app. */
export function CallManager() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [peer, setPeer] = useState<Peer | null>(null);
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const offer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const caller = useRef(false);
  const st = useRef({ phase, peer, secs });
  st.current = { phase, peer, secs };

  const log = (status: string, duration = 0) => {
    const p = st.current.peer;
    if (!p || !caller.current) return;
    apiPost(`/conversations/${p.cid}/calls`, { status, duration }).then(() => qc.invalidateQueries({ queryKey: ["messages", p.cid] })).catch(() => undefined);
  };
  const cleanup = () => {
    pc.current?.close(); pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null;
    offer.current = null; pendingIce.current = []; setPhase("idle"); setPeer(null); setSecs(0); setMuted(false);
  };
  const signal = (action: string, payload?: unknown) => st.current.peer && wsSend({ type: "call", conversation_id: st.current.peer.cid, action, payload });

  const makePc = async () => {
    try {
      local.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if ((err as Error).name === "NotAllowedError") {
        toast.error("Microphone access is blocked. Allow the microphone in your browser settings to call.");
        throw new Error("mic");
      }
      toast.warning("No microphone found — you can listen, but the other person won't hear you.");
      local.current = null;
    }
    const conn = new RTCPeerConnection(await iceConfig());
    if (local.current) local.current.getTracks().forEach((t) => conn.addTrack(t, local.current!));
    else conn.addTransceiver("audio", { direction: "recvonly" });
    conn.onicecandidate = (e) => e.candidate && signal("ice", e.candidate.toJSON());
    conn.ontrack = (e) => { if (audio.current) audio.current.srcObject = e.streams[0]; };
    let drop: ReturnType<typeof setTimeout> | undefined;
    conn.onconnectionstatechange = () => {
      if (pc.current !== conn) return;
      clearTimeout(drop);
      if (conn.connectionState === "connected") setPhase("connected");
      const lost = () => { if (pc.current !== conn) return; toast.error("Call connection lost"); signal("end"); log("failed", st.current.secs); cleanup(); };
      if (conn.connectionState === "failed") lost();
      if (conn.connectionState === "disconnected") drop = setTimeout(lost, 6000); // brief network blips recover on their own
    };
    pc.current = conn;
    return conn;
  };

  useEffect(() => {
    startFn = async (p) => {
      if (st.current.phase !== "idle") return;
      caller.current = true; setPeer(p); st.current.peer = p; setPhase("ringing");
      try {
        const conn = await makePc();
        const o = await conn.createOffer();
        await conn.setLocalDescription(o);
        signal("offer", o);
      } catch { cleanup(); }
    };
    const off = onRealtime(async (e) => {
      if (e.type !== "call") return;
      const cur = st.current;
      if (e.action === "offer") {
        if (cur.phase !== "idle") { wsSend({ type: "call", conversation_id: e.conversation_id, action: "busy" }); return; }
        caller.current = false; offer.current = e.payload as RTCSessionDescriptionInit;
        pendingIce.current = (e.ice as RTCIceCandidateInit[] | undefined) ?? [];
        setPeer({ cid: e.conversation_id, name: e.from_name ?? "Caller", avatar: e.from_avatar }); setPhase("incoming");
        return;
      }
      if (!cur.peer || cur.peer.cid !== e.conversation_id) return;
      if (e.action === "answer" && pc.current) {
        await pc.current.setRemoteDescription(e.payload as RTCSessionDescriptionInit);
        for (const c of pendingIce.current) await pc.current.addIceCandidate(c);
        pendingIce.current = []; setPhase("connecting");
      } else if (e.action === "ice") {
        const c = e.payload as RTCIceCandidateInit;
        if (pc.current?.remoteDescription) await pc.current.addIceCandidate(c).catch(() => undefined); else pendingIce.current.push(c);
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
        toast.error("Couldn't connect the audio. The network may be blocking calls, so please try again on Wi-Fi or mobile data.");
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

  useEffect(() => { local.current?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }, [muted]);

  const accept = async () => {
    try {
      setPhase("connecting");
      const conn = await makePc();
      await conn.setRemoteDescription(offer.current!);
      for (const c of pendingIce.current) await conn.addIceCandidate(c);
      pendingIce.current = [];
      const a = await conn.createAnswer();
      await conn.setLocalDescription(a);
      signal("answer", a);
    } catch { signal("reject"); cleanup(); }
  };
  const hangup = () => { signal(phase === "incoming" ? "reject" : "end"); log(phase === "connected" ? "completed" : phase === "connecting" ? "failed" : "missed", secs); cleanup(); };
  const fmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <>
      <audio ref={audio} autoPlay />
      <Dialog open={phase !== "idle"} onOpenChange={(o) => !o && hangup()}>
        <DialogContent showCloseButton={false} className="overflow-hidden border-0 p-0 sm:max-w-sm" data-testid="call-modal">
          <div className="bg-[#0B1220] p-8 text-center text-white">
            <DialogTitle className="sr-only">Audio call</DialogTitle>
            <p className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Lock className="h-3 w-3" /> Encrypted peer-to-peer audio</p>
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
