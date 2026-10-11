import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost } from "@/lib/api";
import { toastErr } from "@/lib/hooks";

function useBackupPhone(onSaved?: () => void) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["messages"] }); qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries({ queryKey: ["conversations"] }); };
  const save = useMutation({
    mutationFn: (b: { country_code: string; phone: string }) => apiPost("/me/backup-phone", b),
    onSuccess: () => { toast.success("WhatsApp number saved for backup"); refresh(); onSaved?.(); },
    onError: toastErr,
  });
  const skip = useMutation({ mutationFn: () => apiPost("/me/backup-phone/skip"), onSuccess: refresh, onError: toastErr });
  return { save, skip };
}

function PhoneForm({ onSubmit, pending, autoFocus }: { onSubmit: (b: { country_code: string; phone: string }) => void; pending: boolean; autoFocus?: boolean }) {
  const [cc, setCc] = useState("+91");
  const [phone, setPhone] = useState("");
  const digits = phone.replace(/\D/g, "");
  const ok = /^\+\d{1,4}$/.test(cc) && digits.length >= 6 && digits.length <= 14;
  return (
    <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit({ country_code: cc, phone: digits }); }}>
      <Input className="h-9 w-16 bg-background px-2" value={cc} onChange={(e) => setCc(e.target.value)} inputMode="tel" aria-label="Country code" data-testid="backup-phone-cc" />
      <Input className="h-9 min-w-0 flex-1 bg-background" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="WhatsApp number" autoFocus={autoFocus} data-testid="backup-phone-input" />
      <Button type="submit" size="sm" className="h-9" disabled={!ok || pending} data-testid="backup-phone-share">{pending ? "Saving…" : "Share"}</Button>
    </form>
  );
}

/** The first-chat card: "share your WhatsApp number for backup?" (optional, Share / Skip). */
export function BackupPhoneCard({ text }: { text: string }) {
  const { save, skip } = useBackupPhone();
  return (
    <div className="my-2 w-full max-w-sm self-center rounded-2xl border border-emerald-500/40 bg-card p-3 shadow-md animate-rise" data-testid="backup-phone-card">
      <p className="flex items-start gap-2 text-sm font-medium leading-snug"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{text}</p>
      <div className="mt-2.5"><PhoneForm onSubmit={(b) => save.mutate(b)} pending={save.isPending} /></div>
      <button className="mt-2 w-full text-center text-xs font-medium text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline" onClick={() => skip.mutate()} disabled={skip.isPending} data-testid="backup-phone-skip">Skip for now</button>
    </div>
  );
}

/** Same thing from the menu, for customers who skipped earlier. */
export function BackupPhoneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { save } = useBackupPhone(() => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="backup-phone-dialog">
        <DialogHeader>
          <DialogTitle>WhatsApp backup number</DialogTitle>
          <DialogDescription>Optional. It lets you restore your chats on a new phone or in the app, using a WhatsApp code.</DialogDescription>
        </DialogHeader>
        <PhoneForm onSubmit={(b) => save.mutate(b)} pending={save.isPending} autoFocus />
      </DialogContent>
    </Dialog>
  );
}
