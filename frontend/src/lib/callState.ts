import { useSyncExternalStore } from "react";

/** Is an audio call on screen? Reminder / install / backup popups stay hidden while it is, so they never cover the call controls. */
let active = false;
const subs = new Set<() => void>();
export const setCallActive = (v: boolean) => { if (active !== v) { active = v; subs.forEach((f) => f()); } };
export const isCallActive = () => active;
export const useCallActive = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => active);
