import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "./api";
import type { Attachment } from "./types";

export const MAX_UPLOAD = 9 * 1024 * 1024;
interface Signature { signature: string; timestamp: number; cloud_name: string; api_key: string; folder: string; max_bytes: number }

/** Signed direct upload to Cloudinary (secret stays on the backend). */
export async function uploadFile(file: File | Blob, name = "file"): Promise<Attachment> {
  if (file.size > MAX_UPLOAD) throw new Error("Files must be 9 MB or smaller");
  const sig = await apiGet<Signature>("/media/signature");
  const form = new FormData();
  form.append("file", file, (file as File).name ?? name);
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
  const t = file.type;
  const kind: Attachment["kind"] = t.startsWith("image/") ? "image" : t.startsWith("video/") ? "video" : t.startsWith("audio/") ? "audio" : "file";
  return { kind, name: (file as File).name ?? name, url: data.secure_url, size: file.size };
}

/** URL field + real upload button with preview — used for every image setting. */
export function ImageInput({ value, onChange, testid, placeholder = "https://…" }: { value: string; onChange: (url: string) => void; testid: string; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file");
    setBusy(true);
    try { onChange((await uploadFile(f)).url); toast.success("Image uploaded"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-2">
      {value && <img src={value} alt="" className="h-9 w-9 shrink-0 rounded-lg border object-cover" />}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={`${testid}-url`} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()} data-testid={`${testid}-upload`}>
        <Upload className="h-3.5 w-3.5" />{busy ? "…" : "Upload"}
      </Button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
