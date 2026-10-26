import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { FileRow } from "../../lib/types";
import { useApp } from "../../core/app-context";

/** Resize photos in the browser (~1600px, JPEG) so uploads stay around 300 KB. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 350_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function Workings(props: { quoteId: number | null; readOnly?: boolean }) {
  const { toast } = useApp();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<FileRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = () => props.quoteId && api.get<FileRow[]>(`/files?owner_type=quote&owner_id=${props.quoteId}`).then(setFiles);
  useEffect(() => {
    load();
  }, [props.quoteId]);

  async function upload(list: File[]) {
    if (!props.quoteId || !list.length) return;
    setBusy(true);
    try {
      for (const f of list) {
        const small = await shrink(f);
        const fd = new FormData();
        fd.append("file", small);
        fd.append("owner_type", "quote");
        fd.append("owner_id", String(props.quoteId));
        await api.post("/files", fd);
      }
      toast(list.length > 1 ? `${list.length} workings uploaded` : "Working uploaded");
      await load();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      const out: File[] = [];
      for (const it of items) {
        const t = it.types.find((x) => x.startsWith("image/"));
        if (t) out.push(new File([await it.getType(t)], `screenshot-${Date.now()}.png`, { type: t }));
      }
      if (out.length) upload(out);
      else toast("No image on the clipboard. Take a screenshot first (Win+Shift+S).", true);
    } catch {
      toast("Click inside the Workings box and press Ctrl+V to paste a screenshot.", true);
    }
  }

  async function remove(f: FileRow) {
    if (!confirm(`Delete ${f.name}?`)) return;
    await api.del(`/files/${f.id}`);
    load();
  }

  if (!props.quoteId)
    return (
      <div className="card">
        <h3>Workings</h3>
        <p className="muted" style={{ fontSize: 13 }}>Save the quote first, then attach photos or screenshots of your working. Workings are never printed or emailed.</p>
      </div>
    );

  return (
    <div
      className="card"
      ref={boxRef}
      tabIndex={-1}
      onPaste={(e) => {
        const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
        if (imgs.length) {
          e.preventDefault();
          e.stopPropagation();
          upload(imgs);
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="card-head">
        <h3>Workings</h3>
        <span className="muted" style={{ fontSize: 12 }}>internal · never printed</span>
      </div>
      <div className="thumbs">
        {files.map((f) => (
          <div className="thumb" key={f.id} title={f.name}>
            {f.mime.startsWith("image/") ? (
              <img src={`/api/files/${f.id}`} alt={f.name} onClick={() => setView(f)} style={{ cursor: "zoom-in" }} />
            ) : (
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
            )}
            {!props.readOnly && <button onClick={() => remove(f)} aria-label="Delete">✕</button>}
          </div>
        ))}
        {!props.readOnly && (
          <div className="thumb add" onClick={() => inputRef.current?.click()} role="button">
            {busy ? "Uploading…" : "+ Photo / file"}
          </div>
        )}
      </div>
      {!props.readOnly && (
        <div className="btn-row">
          <button className="btn sm" onClick={pasteFromClipboard}>Paste screenshot</button>
          <span className="muted" style={{ fontSize: 12 }}>On a phone, “+ Photo” opens the camera.</span>
        </div>
      )}
      <input ref={inputRef} type="file" hidden multiple accept="image/*,application/pdf,.xlsx,.xls,.csv"
        onChange={(e) => { upload(Array.from(e.target.files || [])); e.target.value = ""; }} />
      {view && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={`/api/files/${view.id}`} alt={view.name} />
        </div>
      )}
    </div>
  );
}
