import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { clock, toastErr } from "@/lib/hooks";
import type { Conversation, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Choose an option" message from the automatic chat flow. Customers tap once; staff see which option was chosen. */
export function MenuCard({ m, conv, viewer }: { m: Message; conv: Conversation; viewer: "customer" | "employee" | "admin" }) {
  const qc = useQueryClient();
  const choose = useMutation({
    mutationFn: (option_id: string) => apiPost<Message>(`/conversations/${conv.id}/menu/${m.id}`, { option_id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages", conv.id] }); qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: toastErr,
  });
  const answered = m.answered || (choose.isPending ? choose.variables : "");
  const canTap = viewer === "customer" && !answered;
  return (
    <div className="max-w-[85%] self-start animate-rise sm:max-w-[70%]" data-testid="chat-menu-message">
      <div className="rounded-2xl rounded-bl-md bg-bubble-in px-3 py-2 text-sm shadow-sm">
        {viewer === "admin" && <p className="mb-0.5 text-[10px] font-semibold text-primary">{m.sender_name}</p>}
        <p className="whitespace-pre-wrap font-medium" data-testid="chat-menu-prompt">{m.text}</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {(m.options ?? []).map((o) => {
            const picked = answered === o.id;
            return (
              <button key={o.id} disabled={!canTap} onClick={() => choose.mutate(o.id)} data-testid="chat-menu-option"
                className={cn("flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-[transform,background-color,opacity] duration-150",
                  picked ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 bg-background text-primary",
                  canTap ? "hover:bg-primary/10 active:scale-[0.97]" : !picked && "opacity-50")}>
                {picked && <CheckCircle2 className="h-4 w-4" />}{o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-right text-[10px] opacity-60">{clock(m.created_at)}{viewer !== "customer" && (answered ? " · customer chose" : " · waiting for customer")}</p>
      </div>
    </div>
  );
}
