import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/common";
import { uploadFile } from "@/lib/media";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 5 * 1024 * 1024;
const OUT = 512;

/** Upload, crop (square, zoom and drag), replace or remove a profile picture. Stored on Cloudinary through the signed upload. */
export function AvatarUploader({ name, value, onChange }: { name: string; value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const VIEW = 260;

  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setOff({ x: 0, y: 0 }); };
    i.src = src;
  }, [src]);

  // draw the crop preview: image covers the square, scaled by zoom and moved by the drag offset
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    const base = VIEW / Math.min(img.width, img.height);
    const s = base * zoom, w = img.width * s, h = img.height * s;
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(img, (VIEW - w) / 2 + off.x, (VIEW - h) / 2 + off.y, w, h);
  }, [img, zoom, off]);

  const pick = (f?: File) => {
    if (!f) return;
    if (!TYPES.includes(f.type)) return toast.error("Use a JPG, PNG or WebP image");
    if (f.size > MAX) return toast.error("Image must be 5 MB or smaller");
    setSrc(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const out = document.createElement("canvas");
      out.width = out.height = OUT;
      const k = OUT / VIEW, base = VIEW / Math.min(img.width, img.height), s = base * zoom;
      const w = img.width * s, h = img.height * s;
      out.getContext("2d")!.drawImage(img, ((VIEW - w) / 2 + off.x) * k, ((VIEW - h) / 2 + off.y) * k, w * k, h * k);
      const blob = await new Promise<Blob>((r, j) => out.toBlob((b) => (b ? r(b) : j(new Error("Crop failed"))), "image/jpeg", 0.9));
      onChange((await uploadFile(blob, "avatar.jpg")).url);
      toast.success("Photo ready. Save your profile to apply it");
      setSrc(null);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-4" data-testid="avatar-uploader">
      <button type="button" onClick={() => input.current?.click()} className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-primary" aria-label="Change profile picture" data-testid="avatar-upload-trigger">
        <Avatar name={name} src={value} size={72} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"><Camera className="h-5 w-5" /></span>
      </button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} data-testid="avatar-upload-button"><Camera className="h-4 w-4" /> {value ? "Replace photo" : "Upload photo"}</Button>
        {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")} data-testid="avatar-remove-button"><Trash2 className="h-4 w-4" /> Remove</Button>}
      </div>
      <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} data-testid="avatar-file-input" />
      <Dialog open={!!src} onOpenChange={(o) => !o && setSrc(null)}>
        <DialogContent className="sm:max-w-sm" data-testid="avatar-crop-dialog">
          <DialogHeader><DialogTitle>Crop your photo</DialogTitle><DialogDescription>Drag to move the photo, and use the slider to zoom.</DialogDescription></DialogHeader>
          <div className="mx-auto overflow-hidden rounded-full border-4 border-primary/30" style={{ width: VIEW, height: VIEW }}>
            <canvas ref={canvas} width={VIEW} height={VIEW} className="cursor-grab touch-none active:cursor-grabbing" data-testid="avatar-crop-canvas"
              onPointerDown={(e) => { drag.current = { x: e.clientX - off.x, y: e.clientY - off.y }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => drag.current && setOff({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
              onPointerUp={() => { drag.current = null; }} />
          </div>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" data-testid="avatar-zoom" />
          <DialogFooter><Button onClick={save} disabled={busy || !img} data-testid="avatar-crop-save">{busy ? "Uploading…" : "Use photo"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
