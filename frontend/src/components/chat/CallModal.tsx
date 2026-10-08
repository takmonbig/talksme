import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, MockBadge } from "@/components/common";
import { apiPost } from "@/lib/api";
import { toastErr } from "@/lib/hooks";
import type { Call } from "@/lib/types";

type Phase = "incoming" | "ringing" | "connected" | "ended";

/** MOCKED WebRTC: simulates call state only — no real audio is transmitted. */
export function CallModal({ open, onClose, conversationId, peerName, peerAvatar, incoming }: {
  open: boolean; onClose: () => void; conversationId: string; peerName: string; peerAvatar?: string; incoming?: boolean;
}) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("ringing");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [mic, setMic] = useState<"unknown" | "ok" | "denied" | "unsupported">("unknown");
  const streamRef = useRef<MediaStream | null>(null);

  const log = useMutation({
    mutationFn: (b: { status: Call["status"]; duration: number }) => apiPost<Call>(`/conversations/${conversationId}/calls`, b),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast(c.status === "completed" ? `Call ended · ${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : `Call ${c.status}`);
    },
    onError: toastErr,
  });

  useEffect(() => {
    if (!open) return;
    setPhase(incoming ? "incoming" : "ringing"); setSecs(0); setMuted(false);
    if (!navigator.mediaDevices?.getUserMedia) { setMic("unsupported"); return; }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((s) => { streamRef.current = s; setMic("ok"); })
      .catch(() => setMic("denied"));
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [open, incoming]);

  useEffect(() => {
    if (!open) return;
    if (phase === "ringing") {
      const t = setTimeout(() => setPhase("connected"), 3000);
      return () => clearTimeout(t);
    }
    if (phase === "connected") {
      const t = setInterval(() => setSecs((s) => s + 1), 1000);
      return () => clearInterval(t);
    }
  }, [phase, open]);

  useEffect(() => { streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }, [muted]);

  const finish = (status: Call["status"]) => {
    log.mutate({ status, duration: status === "completed" ? secs : 0 });
    setPhase("ended");
    onClose();
  };
  const fmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && phase !== "ended") finish(phase === "connected" ? "completed" : "missed"); }}>
      <DialogContent showCloseButton={false} className="overflow-hidden border-0 p-0 sm:max-w-sm" data-testid="call-modal">
        <div className="bg-[#0B1220] p-8 text-center text-white">
          <DialogTitle className="sr-only">Audio call</DialogTitle>
          <MockBadge label="MOCKED WebRTC · no real audio" />
          <div className="relative mx-auto mt-6 h-24 w-24">
            {phase !== "connected" && <span className="animate-pulse-ring absolute inset-0 rounded-full bg-sky-400/40" />}
            <div className="relative"><Avatar name={peerName} src={peerAvatar} size={96} /></div>
          </div>
          <p className="mt-4 font-heading text-xl font-semibold">{peerName}</p>
          <p className="mt-1 text-sm text-slate-400" data-testid="call-status">
            {phase === "incoming" ? "Incoming audio call…" : phase === "ringing" ? "Calling…" : `Connected · ${fmt}`}
          </p>
          {phase === "connected" && (
            <div className="mt-4 flex h-8 items-end justify-center gap-1" aria-hidden>
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} className="animate-wave w-1 rounded-full bg-sky-400" style={{ height: "100%", animationDelay: `${i * 80}ms`, opacity: muted ? 0.25 : 1 }} />
              ))}
            </div>
          )}
          {mic !== "ok" && mic !== "unknown" && (
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300" data-testid="call-mic-warning">
              {mic === "denied" ? "Microphone permission denied — simulation continues without audio." : "This device doesn't support audio capture."}
            </p>
          )}
          <div className="mt-8 flex items-center justify-center gap-4">
            {phase === "incoming" ? (
              <>
                <Button size="icon-lg" className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600" onClick={() => finish("rejected")} data-testid="call-reject-button"><PhoneOff /></Button>
                <Button size="icon-lg" className="h-14 w-14 rounded-full bg-emerald-500 hover:bg-emerald-600" onClick={() => setPhase("connected")} data-testid="call-accept-button"><PhoneIncoming /></Button>
              </>
            ) : (
              <>
                <Button size="icon-lg" variant="secondary" className="h-14 w-14 rounded-full" onClick={() => setMuted((m) => !m)} disabled={phase !== "connected"} data-testid="call-mute-button">
                  {muted ? <MicOff /> : <Mic />}
                </Button>
                <Button size="icon-lg" className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600" onClick={() => finish(phase === "connected" ? "completed" : "missed")} data-testid="call-end-button"><PhoneOff /></Button>
              </>
            )}
          </div>
          {phase === "ringing" && (
            <button className="mt-4 text-xs text-slate-400 underline" onClick={() => finish("busy")} data-testid="call-simulate-busy">Simulate busy / no answer</button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CallButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} title={disabled ? "Audio calls disabled for this page" : "Start audio call (mocked)"} data-testid="chat-call-button">
      <Phone className="h-4 w-4" />
    </Button>
  );
}
