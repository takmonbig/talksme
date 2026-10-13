import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { toastErr, useMe } from "@/lib/hooks";
import type { StartChatOut } from "@/lib/types";

/** Sticky "Contact us now" footer for visitors who haven't become a TalksMe business customer yet (hidden for staff accounts). */
export function ContactFooter() {
  const me = useMe();
  const nav = useNavigate();
  const m = useMutation({
    mutationFn: () => apiPost<StartChatOut>("/public/support/start", {}),
    onSuccess: (r) => { beginSession(); if (r.conversation_id) nav(`/chat/${r.conversation_id}`); },
    onError: toastErr,
  });
  if (me.data && me.data.role !== "customer") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="contact-footer">
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-card/95 p-2.5 pl-4 shadow-2xl backdrop-blur animate-rise">
        <p className="min-w-0 flex-1 text-sm"><b>Want TalksMe for your business?</b> <span className="hidden text-muted-foreground sm:inline">Talk to our team now.</span></p>
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="shrink-0" data-testid="contact-us-now-button"><Headphones className="h-4 w-4" /> {m.isPending ? "Connecting…" : "Contact us now"}</Button>
      </div>
    </div>
  );
}
