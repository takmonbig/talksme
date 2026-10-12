import { useState } from "react";
import { CheckCircle2, CircleAlert, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testPixel } from "@/lib/pixel";

/** Fires real test events from the Admin's browser and confirms Meta received them (facebook.com/tr request). */
export function PixelTester({ pixelId }: { pixelId: string }) {
  const [res, setRes] = useState<{ ev: string; script: boolean; sent: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async (ev: string) => { setBusy(true); const r = await testPixel(pixelId, ev); setRes((x) => [{ ev, ...r }, ...x].slice(0, 6)); setBusy(false); };
  return (
    <div className="space-y-2 rounded-xl border p-3" data-testid="pixel-tester">
      <p className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-primary" /> Pixel test</p>
      {!/^\d{6,20}$/.test(pixelId) ? <p className="text-xs text-muted-foreground">Enter a Pixel ID to test.</p> : (
        <>
          <div className="flex flex-wrap gap-2">{["PageView", "Lead", "Contact"].map((ev) => <Button key={ev} size="sm" variant="outline" disabled={busy} onClick={() => run(ev)} data-testid={`pixel-test-${ev.toLowerCase()}`}>Send {ev}</Button>)}</div>
          {res.map((r, i) => (
            <p key={i} className={`flex items-center gap-1.5 text-xs ${r.sent ? "text-emerald-600" : "text-destructive"}`} data-testid="pixel-test-result">
              {r.sent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
              {r.ev}: {r.sent ? "received by Meta" : r.script ? "the pixel loaded but no event left the browser (an ad blocker may be blocking it)" : "the pixel script couldn't load (ad blocker, or a wrong ID)"}
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground">Then check Meta Events Manager → your Pixel → <b>Test events</b>, or the Meta Pixel Helper extension on the live page. Remember to save and publish the page.</p>
        </>
      )}
    </div>
  );
}
