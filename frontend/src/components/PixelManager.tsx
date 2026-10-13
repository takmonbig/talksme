import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractPixelId } from "@/lib/pixel";
import { PixelTester } from "@/components/PixelTester";

/** Add / remove up to 5 Meta Pixels for a landing page. Accepts a Pixel ID or the whole pasted Meta Pixel code. */
export function PixelManager({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState("");
  const add = () => {
    const id = extractPixelId(raw);
    if (!/^\d{6,20}$/.test(id)) return setErr("Couldn't find a Pixel ID. Paste the 15–16 digit ID or the full Meta Pixel code.");
    if (ids.includes(id)) return setErr("That Pixel is already added.");
    onChange([...ids, id]); setRaw(""); setErr("");
  };
  return (
    <div className="space-y-2" data-testid="pixel-manager">
      <Label>Meta Pixels</Label>
      {ids.map((id) => (
        <div key={id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5" data-testid="pixel-row">
          <span className="flex-1 font-mono text-sm" data-testid="pixel-row-id">{id}</span>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`Remove pixel ${id}`} data-testid="pixel-remove"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {ids.length < 5 && (
        <div className="flex gap-2">
          <Input value={raw} onChange={(e) => { setRaw(e.target.value); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Paste a Pixel ID or the full Meta Pixel code" data-testid="builder-pixel-input" />
          <Button type="button" variant="outline" onClick={add} disabled={!raw.trim()} data-testid="pixel-add"><Plus className="h-4 w-4" /> Add</Button>
        </div>
      )}
      {err && <p className="text-xs text-destructive" data-testid="pixel-error">{err}</p>}
      <p className="text-[11px] text-muted-foreground">{ids.length ? "PageView fires on every visit, and Lead + Contact fire when a visitor starts a chat, for every Pixel listed. Save and publish to go live." : "No Pixel yet. You can add more than one."}</p>
      {ids.map((id) => <PixelTester key={id} pixelId={id} />)}
    </div>
  );
}
