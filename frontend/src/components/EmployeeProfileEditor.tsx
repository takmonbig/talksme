import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPatch } from "@/lib/api";
import { toastErr } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { AvatarUploader } from "@/components/AvatarUploader";

/** Admin: set employee online/offline instantly. */
export function EmployeeOnlineSwitch({ e }: { e: User }) {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (status: string) => apiPatch(`/admin/employees/${e.id}`, { status }), onSuccess: (_, s) => { toast.success(`${e.name} is now ${s}`); qc.invalidateQueries({ queryKey: ["employees"] }); }, onError: toastErr });
  return (
    <label className="flex items-center gap-1.5 text-xs" data-testid="employee-online-row">
      <Switch checked={e.status === "online"} disabled={!e.active || m.isPending} onCheckedChange={(v) => m.mutate(v ? "online" : "offline")} data-testid="employee-online-switch" />
      <span className={e.status === "online" ? "text-emerald-600" : "text-muted-foreground"}>{e.status === "online" ? "Online" : "Offline"}</span>
    </label>
  );
}

/** Admin: the public profile customers see (title, bio, one link). */
export function EmployeeProfileEditor({ e }: { e: User }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const init = () => ({ name: e.name, title: e.title, bio: e.bio ?? "", profile_link: e.profile_link ?? "", avatar: e.avatar ?? "", display_phone: e.display_phone ?? "", show_phone: !!e.show_phone });
  const [f, setF] = useState(init);
  const phoneOk = !f.display_phone || /^\+?[\d ]{6,18}$/.test(f.display_phone);
  const linkOk = !f.profile_link || /^https?:\/\/\S{3,}$/.test(f.profile_link);
  const m = useMutation({ mutationFn: () => apiPatch(`/admin/employees/${e.id}`, f), onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["employees"] }); setOpen(false); }, onError: toastErr });
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => { setF(init()); setOpen(true); }} data-testid="employee-profile-edit-button"><UserPen className="h-3.5 w-3.5" /> Profile</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="employee-profile-edit-dialog">
          <DialogHeader><DialogTitle>{e.name}'s public profile</DialogTitle><DialogDescription>Customers see this when they tap the employee in chat.</DialogDescription></DialogHeader>
          <div className="space-y-1"><Label>Profile picture</Label><AvatarUploader name={f.name} value={f.avatar} onChange={(url) => setF({ ...f, avatar: url })} /></div>
          <div className="space-y-1"><Label>Full name</Label><Input value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} data-testid="employee-profile-name-input" /></div>
          <div className="space-y-1"><Label>Title</Label><Input value={f.title} maxLength={60} onChange={(x) => setF({ ...f, title: x.target.value })} data-testid="employee-profile-title-input" /></div>
          <div className="space-y-1"><Label>Bio</Label><Textarea value={f.bio} maxLength={300} onChange={(x) => setF({ ...f, bio: x.target.value })} placeholder="e.g. Senior advisor with 8 years of experience…" data-testid="employee-profile-bio-input" /></div>
          <div className="space-y-1"><Label>Profile link</Label><Input value={f.profile_link} onChange={(x) => setF({ ...f, profile_link: x.target.value })} placeholder="https://…" data-testid="employee-profile-link-input" />{!linkOk && <p className="text-xs text-destructive">Must start with https://</p>}</div>
          <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2"><Label>Show number to customers</Label><Switch checked={f.show_phone} onCheckedChange={(v) => setF({ ...f, show_phone: v })} data-testid="employee-show-phone-switch" /></div>
            <Input value={f.display_phone} onChange={(x) => setF({ ...f, display_phone: x.target.value })} placeholder="+91 98765 43210" data-testid="employee-display-phone-input" />
            {!phoneOk && <p className="text-xs text-destructive">Digits only, 6 to 18 characters, optional +</p>}
            <p className="text-[11px] text-muted-foreground">Shown just below the employee's name in the customer's chat.</p>
          </div>
          <DialogFooter><Button disabled={!linkOk || !phoneOk || (f.show_phone && !f.display_phone.trim()) || f.name.trim().length < 2 || m.isPending} onClick={() => m.mutate()} data-testid="employee-profile-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
