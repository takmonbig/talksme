import { BadgeCheck, Building2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/common";
import { safeHref } from "@/components/chat/Linkify";
import type { Conversation } from "@/lib/types";

/** What a customer sees when tapping the employee in the chat header (details filled in by the Admin). */
export function EmployeeProfileDialog({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  const href = conv.employee_link ? safeHref(conv.employee_link) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="employee-profile-dialog">
        <DialogHeader className="items-center text-center">
          <Avatar name={conv.employee_name} src={conv.employee_avatar} size={96} status={conv.employee_status} />
          <DialogTitle className="mt-2 flex items-center gap-1.5 text-xl" data-testid="employee-profile-name">{conv.employee_name}{conv.employee_verified && <BadgeCheck className="h-5 w-5 text-primary" />}</DialogTitle>
          <DialogDescription className="flex flex-col items-center gap-0.5">
            {conv.employee_title && <span className="font-medium text-foreground">{conv.employee_title}</span>}
            <span className="flex items-center gap-1" data-testid="employee-profile-company"><Building2 className="h-3.5 w-3.5" />{conv.org_name}</span>
            {conv.employee_verified && <span className="text-[11px] text-primary">Verified Employee</span>}
          </DialogDescription>
        </DialogHeader>
        {conv.employee_bio && <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm" data-testid="employee-profile-bio">{conv.employee_bio}</p>}
        {href && <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-primary transition-colors duration-150 hover:bg-muted" data-testid="employee-profile-link"><ExternalLink className="h-4 w-4" />{conv.employee_link.replace(/^https?:\/\//, "")}</a>}
      </DialogContent>
    </Dialog>
  );
}
