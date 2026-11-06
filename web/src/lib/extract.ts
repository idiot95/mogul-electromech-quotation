// Turn a dropped / pasted / imported file into paste-engine input. Everything runs in the browser and is loaded on demand:
//   .xlsx/.xls/.csv → SheetJS · PDF → pdf.js text with positions (scans → OCR) · images → Tesseract OCR
//   .eml/.msg email → its largest table, else its text, else its first PDF / image / sheet attachment.
import { rowsFromBoxes, textFromBoxes, type Box } from "../../../shared/layout";
import type { PasteInput } from "../../../shared/paste-engine";
import { readSheetFile } from "./sheets";

export interface Extracted {
  input: PasteInput;
  /** Page images to show next to the preview (PDF pages, the screenshot). */
  previews: string[];
  /** Read by OCR: numbers and spelling need a check. */
  ocr?: boolean;
}

export type Progress = (label: string, pct: number | null) => void;

const ext = (f: File) => (f.name.match(/\.(\w+)$/)?.[1] || "").toLowerCase();

export function kindOf(f: File): "sheet" | "pdf" | "image" | "email" | null {
  const e = ext(f);
  if (["xlsx", "xls", "csv"].includes(e)) return "sheet";
  if (e === "pdf" || f.type === "application/pdf") return "pdf";
  if (f.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(e)) return "image";
  if (["eml", "msg"].includes(e) || f.type === "message/rfc822") return "email";
  return null;
}

export const IMPORT_ACCEPT = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.eml,.msg";

export async function extractFile(file: File, progress: Progress = () => {}): Promise<Extracted> {
  switch (kindOf(file)) {
    case "sheet":
      return { input: { rows: await readSheetFile(file), source: "Spreadsheet file" }, previews: [] };
    case "pdf":
      return readPdf(file, progress);
    case "image":
      return readImage(file, progress);
    case "email":
      return readEmail(file, progress);
    default:
      throw new Error("Use an Excel / CSV file, a PDF, a screenshot or photo, or an email (.eml / .msg).");
  }
}

// ---------- images (OCR) ----------

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
};

/** Table borders confuse OCR: whiten long straight dark runs (grid lines); letters are much shorter. */
function removeGridLines(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const W = c.width;
  const H = c.height;
  const dark = (i: number) => d[i * 4] < 185; // scanned / resampled lines come out grey
  const kill: number[] = [];
  // scan one line of pixels; runs may have 1–2 px breaks (scans), letters never run this long
  const scan = (len: number, at: (k: number) => number, min: number) => {
    let start = -1;
    let gap = 0;
    for (let k = 0; k <= len; k++) {
      if (k < len && dark(at(k))) {
        if (start < 0) start = k;
        gap = 0;
      } else if (start >= 0 && k < len && ++gap <= 2) continue;
      else {
        const end = k - gap;
        if (start >= 0 && end - start >= min) for (let j = start; j < end; j++) kill.push(at(j));
        start = -1;
        gap = 0;
      }
    }
  };
  const minH = Math.max(60, W / 25);
  for (let y = 0; y < H; y++) scan(W, (x) => y * W + x, minH);
  const minV = Math.max(40, H / 30);
  for (let x = 0; x < W; x++) scan(H, (y) => y * W + x, minV);
  for (const i of kill) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
  g.putImageData(img, 0, 0);
}

/** Tesseract reads best at ~300 dpi: scale small screenshots up 2×, grey, a little extra contrast, no grid lines. */
async function prepare(src: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const img = src instanceof HTMLCanvasElement ? src : await createImageBitmap(src);
  const scale = img.width < 1800 ? 2 : 1;
  const c = canvasOf(img.width * scale, img.height * scale);
  const g = c.getContext("2d")!;
  g.filter = "grayscale(1) contrast(1.2)";
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, c.width, c.height);
  removeGridLines(c);
  return c;
}

async function ocrBoxes(canvases: HTMLCanvasElement[], progress: Progress): Promise<Box[]> {
  progress("Loading the text reader (first time takes a few seconds)…", null);
  const { createWorker } = await import("tesseract.js");
  let page = 0;
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        const label = canvases.length > 1 ? `Reading page ${page + 1} of ${canvases.length}…` : "Reading the image…";
        progress(label, Math.round(((page + m.progress) / canvases.length) * 100));
      }
    },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const boxes: Box[] = [];
    let yOff = 0;
    for (; page < canvases.length; page++) {
      const { data } = await worker.recognize(canvases[page], {}, { blocks: true });
      for (const b of data.blocks ?? [])
        for (const p of b.paragraphs)
          for (const l of p.lines)
            for (const w of l.words)
              if (w.confidence > 20 && /[\p{L}\p{N}]/u.test(w.text)) boxes.push({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0 + yOff, y1: w.bbox.y1 + yOff });
      yOff += canvases[page].height + 40;
    }
    return boxes;
  } finally {
    await worker.terminate();
  }
}

async function readImage(file: Blob, progress: Progress, source = "Screenshot / photo (read by OCR)"): Promise<Extracted> {
  const canvas = await prepare(file);
  const boxes = await ocrBoxes([canvas], progress);
  const rows = rowsFromBoxes(boxes);
  if (!rows.length) throw new Error("No text found in the image. Try a sharper screenshot, or zoom in before taking it.");
  return { input: { rows, text: textFromBoxes(boxes), source }, previews: [URL.createObjectURL(file)], ocr: true };
}

// ---------- PDF ----------

async function readPdf(file: Blob, progress: Progress): Promise<Extracted> {
  progress("Opening the PDF…", null);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, 10);
  const boxes: Box[] = [];
  const previews: string[] = [];
  const renders: HTMLCanvasElement[] = [];
  let yOff = 0;
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10;
      boxes.push({ text: it.str, x0: x, x1: x + it.width, y0: yOff + y - h, y1: yOff + y });
    }
    yOff += vp.height + 20;
    // a picture of the page for the preview (and for OCR when the PDF is a scan)
    const rvp = page.getViewport({ scale: 2 });
    const c = canvasOf(rvp.width, rvp.height);
    await page.render({ canvas: c, viewport: rvp }).promise;
    renders.push(c);
    previews.push(c.toDataURL("image/jpeg", 0.8));
  }
  const chars = boxes.reduce((n, b) => n + b.text.length, 0);
  if (chars > 20) {
    const rows = rowsFromBoxes(boxes, 0.5);
    return { input: { rows, text: textFromBoxes(boxes), source: "PDF" }, previews };
  }
  // scanned PDF: no text layer, read the page images
  const scanned = await ocrBoxes(await Promise.all(renders.map((c) => prepare(c))), progress);
  const rows = rowsFromBoxes(scanned);
  if (!rows.length) throw new Error("No text found in the PDF.");
  return { input: { rows, text: textFromBoxes(scanned), source: "Scanned PDF (read by OCR)" }, previews, ocr: true };
}

// ---------- email ----------

interface Mail {
  html: string | null;
  text: string | null;
  attachments: File[];
}

async function readEmail(file: File, progress: Progress): Promise<Extracted> {
  progress("Opening the email…", null);
  const mail = ext(file) === "msg" ? await parseMsg(file) : parseEml(new Uint8Array(await file.arrayBuffer()));
  if (mail.html && /<table/i.test(mail.html)) {
    const { rowsFromHTML } = await import("../../../shared/paste-engine");
    const rows = rowsFromHTML(mail.html);
    if (rows && rows.length > 1 && rows.some((r) => r.filter(Boolean).length >= 2)) {
      return { input: { rows, text: `${htmlText(mail.html)}\n${mail.text || ""}`, source: "Email table" }, previews: [] };
    }
  }
  // no table in the body: use an attachment if there is one we can read
  const att = mail.attachments.find((f) => ["sheet", "pdf"].includes(kindOf(f) || "")) || mail.attachments.find((f) => kindOf(f) === "image" && f.size > 20_000);
  const bodyText = mail.text || (mail.html ? htmlText(mail.html) : "");
  if (att && !/^\s*\d+[.)]\s+\S/m.test(bodyText)) {
    const r = await extractFile(att, progress);
    return { ...r, input: { ...r.input, source: `${r.input.source} · attached to the email (${att.name})` } };
  }
  if (!bodyText.trim()) throw new Error("The email has no table, text or readable attachment.");
  return { input: { text: bodyText, source: "Email text" }, previews: [] };
}

function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "$&\n"), "text/html");
  return (doc.body.textContent || "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function parseMsg(file: File): Promise<Mail> {
  const { default: MsgReader } = await import("@kenjiuno/msgreader");
  const r = new MsgReader(await file.arrayBuffer());
  const d = r.getFileData();
  const html = d.bodyHtml || (d.html ? new TextDecoder().decode(d.html) : null);
  const attachments = (d.attachments || [])
    .filter((a) => !a.attachmentHidden && a.fileName)
    .map((a) => {
      const x = r.getAttachment(a);
      return new File([x.content.slice()], x.fileName, { type: mimeOf(x.fileName) });
    });
  return { html, text: d.body || null, attachments };
}

const mimeOf = (name: string) =>
  ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", csv: "text/csv" })[
    (name.match(/\.(\w+)$/)?.[1] || "").toLowerCase()
  ] || "application/octet-stream";

// Minimal MIME reader for .eml: multipart bodies, base64 / quoted-printable, charsets.

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};
const bytesOf = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function headersOf(raw: string): { headers: Record<string, string>; body: string } {
  const m = raw.match(/\r?\n\r?\n/);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(m.index! + m[0].length) : "";
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

const param = (h: string | undefined, name: string) => h?.match(new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]+))`, "i"))?.slice(1).find(Boolean) || "";

function decodeBody(body: string, enc: string): Uint8Array<ArrayBuffer> {
  enc = enc.toLowerCase();
  if (enc === "base64") {
    try {
      return bytesOf(atob(body.replace(/[^A-Za-z0-9+/=]/g, "")));
    } catch {
      return bytesOf(body);
    }
  }
  if (enc === "quoted-printable") return bytesOf(body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
  return bytesOf(body);
}

function decodeText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function parseEml(data: Uint8Array): Mail {
  const out: Mail = { html: null, text: null, attachments: [] };
  const walk = (raw: string, depth: number) => {
    if (depth > 8) return;
    const { headers, body } = headersOf(raw);
    const ct = headers["content-type"] || "text/plain";
    const type = ct.split(";")[0].trim().toLowerCase();
    if (type.startsWith("multipart/")) {
      const boundary = param(ct, "boundary");
      if (!boundary) return;
      const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*\\r?\\n?`));
      for (const p of parts.slice(1)) if (p.trim()) walk(p, depth + 1);
      return;
    }
    const disp = headers["content-disposition"] || "";
    const name = param(disp, "filename") || param(ct, "name");
    const bytes = decodeBody(body, headers["content-transfer-encoding"] || "");
    if (name || /attachment/i.test(disp)) out.attachments.push(new File([bytes], name || "attachment", { type }));
    else if (type === "text/html" && !out.html) out.html = decodeText(bytes, param(ct, "charset"));
    else if (type === "text/plain" && !out.text) out.text = decodeText(bytes, param(ct, "charset"));
    else if (type === "message/rfc822") walk(latin1(bytes), depth + 1);
  };
  walk(latin1(data), 0);
  return out;
}
