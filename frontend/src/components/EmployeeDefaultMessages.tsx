import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch } from "@/lib/api";
import { toastErr } from "@/lib/hooks";
import type { LandingPage } from "@/lib/types";

/** Default customer message per assigned landing page. Editable only where the Admin allows it. */
export function EmployeeDefaultMessages() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["employee-landing-pages"], queryFn: () => apiGet<LandingPage[]>("/employee/landing-pages") });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (x: { id: string; msg: string }) => apiPatch<LandingPage>(`/employee/landing-pages/${x.id}/default-message`, { default_message: x.msg }),
    onSuccess: () => { toast.success("Default message saved"); qc.invalidateQueries({ queryKey: ["employee-landing-pages"] }); }, onError: toastErr,
  });
  if (!q.data?.length) return null;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5" data-testid="employee-default-messages">
      <div><p className="font-semibold">Landing-page default messages</p><p className="text-xs text-muted-foreground">This is prefilled for customers who start a chat from your pages.</p></div>
      {q.data.map((p) => (
        <div key={p.id} className="space-y-1.5 rounded-xl border bg-muted/30 p-3" data-testid="employee-default-message-row">
          <p className="text-sm font-medium">{p.title} <span className="text-xs text-muted-foreground">/{p.slug}</span></p>
          {p.employee_can_edit_message ? (
            <div className="flex gap-2">
              <Textarea rows={2} maxLength={500} value={draft[p.id] ?? p.default_message} onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })} data-testid="employee-default-message-input" />
              <Button size="sm" onClick={() => m.mutate({ id: p.id, msg: draft[p.id] ?? p.default_message })} disabled={m.isPending} data-testid="employee-default-message-save">Save</Button>
            </div>
          ) : <p className="text-xs text-muted-foreground">{p.default_message || "No default message"} · <i>only your Admin can edit this</i></p>}
        </div>
      ))}
    </div>
  );
}
