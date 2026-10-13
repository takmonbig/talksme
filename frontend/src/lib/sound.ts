/** Tiny WebAudio sound kit (no audio files): message "ding", looping ringtone for incoming calls, ringback for outgoing. */
let ctx: AudioContext | null = null;
/** Vibrate only after the user has interacted with the page (browsers block it otherwise). */
const buzz = (p: number | number[]) => { if ((navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); };
const ac = () => {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx;
};

// Browsers only allow sound after a user gesture: unlock on the first tap/keypress.
if (typeof window !== "undefined") {
  const unlock = () => { ac(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone(freq: number, start: number, dur: number, vol = 0.18) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export function playMessageTone() {
  tone(880, 0, 0.18);
  tone(1320, 0.12, 0.25);
  buzz(120);
}

let ringTimer: ReturnType<typeof setInterval> | null = null;
/** kind="incoming" = phone ringtone + vibration; kind="outgoing" = soft ringback while waiting for the other side. */
export function startRing(kind: "incoming" | "outgoing") {
  stopRing();
  const ring = () => {
    if (kind === "incoming") {
      [0, 0.25, 0.5, 0.75].forEach((t, i) => tone(i % 2 ? 1046 : 784, t, 0.22, 0.25));
      buzz([400, 200, 400]);
    } else {
      tone(440, 0, 1.0, 0.08);
      tone(480, 0, 1.0, 0.08);
    }
  };
  ring();
  ringTimer = setInterval(ring, kind === "incoming" ? 2000 : 3000);
}
export function stopRing() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  buzz(0);
}
