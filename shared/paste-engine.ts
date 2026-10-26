// Mogul Workspace · paste engine (core service, reusable by any module)
//
// Turns whatever the user pastes — Excel cells (rich HTML clipboard or tab-separated text),
// a numbered list from an email, or rows from a dropped .xlsx/.csv — into quote lines.
//
// Five stages: 1 read → 2 find header → 3 map columns → 4 clean rows → 5 preview (UI).
// Rates are never guessed: a price column is ignored unless the user maps it to Rate.

export type Role = "sr" | "desc" | "append" | "qty" | "unit" | "rate" | "ignore";

export interface ParsedItem {
  desc: string;
  heading?: boolean;
  qty?: number;
  unit?: string;
  rate?: number | null;
  flag?: boolean; // no quantity found, defaulted to 1
}

export interface PasteResult {
  mode: "grid" | "text";
  source: string;
  header: boolean;
  cols: { label: string; role: Role }[];
  items: ParsedItem[];
  notes: string[];
  enquiry: string | null;
}

export interface PasteInput {
  text?: string;
  html?: string | null;
  rows?: string[][]; // already-tabular input, e.g. from an .xlsx file, a PDF or a screenshot
  source?: string; // where it came from, shown in the preview ("PDF", "Screenshot (read by OCR)", …)
}

const UNIT_WORDS =
  "nos?|no\\.|numbers?|pcs?|pieces?|sets?|pairs?|prs?|mtrs?|meters?|metres?|m|rm|kgs?|lots?|rolls?|ltrs?|litres?|liters?|ea|each|units?|lengths?|boxes|box|coils?|sheets?|pkts?|packets?|lot|lumpsum|ls";
const UNIT_NORM: Record<string, string> = {
  no: "Nos.", nos: "Nos.", number: "Nos.", numbers: "Nos.", ea: "Nos.", each: "Nos.", unit: "Nos.", units: "Nos.",
  pc: "Pcs", pcs: "Pcs", piece: "Pcs", pieces: "Pcs", set: "Set", sets: "Set", pair: "Pair", pairs: "Pair",
  pr: "Pair", prs: "Pair", m: "Mtr", rm: "Mtr", mtr: "Mtr", mtrs: "Mtr", meter: "Mtr", meters: "Mtr", metre: "Mtr",
  metres: "Mtr", kg: "Kg", kgs: "Kg", lot: "Lot", lots: "Lot", roll: "Roll", rolls: "Roll", ltr: "Ltr", ltrs: "Ltr",
  litre: "Ltr", litres: "Ltr", liter: "Ltr", liters: "Ltr", length: "Length", lengths: "Length", box: "Box",
  boxes: "Box", coil: "Coil", coils: "Coil", sheet: "Sheet", sheets: "Sheet", pkt: "Pkt", pkts: "Pkt",
  packet: "Pkt", packets: "Pkt", lumpsum: "LS", ls: "LS",
};
const isUnitRe = new RegExp(`^\\s*(${UNIT_WORDS})\\.?\\s*$`, "i");
const qtyUnitCellRe = new RegExp(`^\\s*([\\d,]+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})?\\.?\\s*$`, "i");

export function normUnit(u: string | undefined | null): string {
  if (!u) return "";
  const k = u.toLowerCase().replace(/\.$/, "").trim();
  return UNIT_NORM[k] || u.trim();
}

export function toNum(s: unknown): number | null {
  if (s == null) return null;
  const t = String(s).replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
}

const ROLE_RES: [Role | "ignore-rate", RegExp][] = [
  ["sr", /^(s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|sno|sl|sr|#|item\s*no\.?|no\.?|line)$/i],
  ["qty", /^(qty|qnty|quantity|req(uired)?\.?\s*qty|qty\.?\s*req(uired)?|nos)\.?$/i],
  ["unit", /^(uom|u\.?o\.?m\.?|unit|units|u\/m)$/i],
  ["rate", /(unit\s*)?(rate|price|cost)/i],
  ["ignore", /amount|total|value|delivery|lead\s*time|stock/i],
  ["append", /part|make|brand|model|size|code|rating|spec|type|drg|drawing|remark|note|mfr|manufacturer/i],
  ["desc", /desc|particular|item|material|product|details|name|scope/i],
];

function roleForHeader(h: string): string | null {
  h = (h || "").trim();
  if (!h) return null;
  for (const [role, re] of ROLE_RES) if (re.test(h)) return role;
  return null;
}

// ---------- stage 1: clipboard → rows ----------

export function rowsFromHTML(html: string): string[][] | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Emails wrap content in layout tables and add signature tables: take the innermost table with the most cells.
  const tables = [...doc.querySelectorAll("table")].filter((t) => !t.querySelector("table"));
  if (!tables.length) return null;
  const cells = (t: Element) => t.querySelectorAll("td,th").length;
  const tbl = tables.reduce((a, b) => (cells(b) > cells(a) ? b : a));
  const out: string[][] = [];
  tbl.querySelectorAll("tr").forEach((tr) => {
    const r: string[] = [];
    tr.querySelectorAll("td,th").forEach((td) => {
      td.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      const t = (td.textContent || "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").trim();
      r.push(t);
      const span = +(td.getAttribute("colspan") || 1);
      for (let k = 1; k < span; k++) r.push("");
    });
    out.push(r);
  });
  return out;
}

/** Quote-aware TSV reader; handles multi-line cells as Excel puts them on the clipboard. */
export function rowsFromTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  text = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((s) => s.trim()));
}

// ---------- stages 2–4 for tabular input ----------

function analyseGrid(rowsIn: string[][], overrides?: Record<number, Role>): Omit<PasteResult, "source" | "enquiry"> {
  const notes: string[] = [];
  let rows = rowsIn.map((r) => r.map((c) => (c == null ? "" : String(c).trim()))).filter((r) => r.some((c) => c !== ""));
  if (!rows.length) return { mode: "grid", header: false, cols: [], items: [], notes };
  let n = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => {
    const x = r.slice();
    while (x.length < n) x.push("");
    return x;
  });
  // drop fully empty columns
  const keep: number[] = [];
  for (let c = 0; c < n; c++) if (rows.some((r) => r[c] !== "")) keep.push(c);
  rows = rows.map((r) => keep.map((k) => r[k]));
  n = keep.length;

  // stage 2: header = first of the top 6 rows with ≥2 recognised header names
  let hi = -1;
  for (let h = 0; h < Math.min(6, rows.length); h++) {
    const hits = rows[h].filter((x) => roleForHeader(x) && x.length < 40).length;
    if (hits >= 2) {
      hi = h;
      break;
    }
  }
  const header = hi >= 0 ? rows[hi] : null;
  if (hi > 0) notes.push(`${hi} line${hi > 1 ? "s" : ""} above the header skipped`);
  const body = hi >= 0 ? rows.slice(hi + 1) : rows;

  // stage 3: column roles by header name, then by content
  let roles: string[] = [];
  const labels: string[] = [];
  for (let c = 0; c < n; c++) {
    labels.push(header && header[c] ? header[c] : "Column " + String.fromCharCode(65 + c));
    roles.push((header ? roleForHeader(header[c]) : null) as string);
  }
  const colVals = (c: number) => body.map((r) => r[c]).filter((v) => v !== "");
  for (let c = 0; c < n; c++) {
    if (roles[c]) continue;
    const v = colVals(c);
    if (!v.length) {
      roles[c] = "ignore";
      continue;
    }
    const nums = v.filter((x) => toNum(x) != null || qtyUnitCellRe.test(x)).length;
    const units = v.filter((x) => isUnitRe.test(x)).length;
    const seq = v.every((x, i) => toNum(x) === i + 1);
    if (seq && !roles.includes("sr")) roles[c] = "sr";
    else if (units > v.length / 2 && !roles.includes("unit")) roles[c] = "unit";
    else if (nums > v.length / 2) roles[c] = !roles.includes("qty") ? "qty" : "ignore";
    else roles[c] = "text";
  }
  if (!roles.includes("desc")) {
    let best = -1;
    let bl = -1;
    for (let c = 0; c < n; c++)
      if (roles[c] === "text" || roles[c] === "append") {
        const L = colVals(c).join("").length;
        if (L > bl) {
          bl = L;
          best = c;
        }
      }
    if (best >= 0) roles[best] = "desc";
  }
  roles = roles.map((r) => (r === "text" ? "append" : r));
  for (let c = 0; c < n; c++) if (roles[c] === "rate" && !(overrides && overrides[c])) roles[c] = "ignore-rate";
  if (overrides) for (const k in overrides) if (+k < n) roles[+k] = overrides[k];
  if (roles.includes("ignore-rate"))
    notes.push("Price column ignored — rates are typed in. Switch it to Rate to import it.");

  // stage 4: rows → items
  const items: ParsedItem[] = [];
  let skipped = 0,
    joined = 0,
    hdrSkip = 0,
    totalRows = 0;
  const get = (r: string[], role: string) => {
    const i = roles.indexOf(role);
    return i >= 0 ? r[i] : "";
  };
  body.forEach((r, ri) => {
    if (header && r.filter((x, i) => x && header[i] && x.toLowerCase() === header[i].toLowerCase()).length >= 2) {
      hdrSkip++;
      return;
    }
    if (r.some((x) => /^(sub\s*-?\s*total|grand\s*total|total(\s*(amount|value|qty|quantity))?)\s*:?$/i.test(x))) {
      totalRows++;
      return;
    }
    const desc = get(r, "desc");
    const extras: string[] = [];
    roles.forEach((role, i) => {
      if (role === "append" && r[i]) extras.push((header && header[i] ? header[i].replace(/[:.]$/, "") + ": " : "") + r[i]);
    });
    const qraw = get(r, "qty");
    let q: number | null = null;
    let u = normUnit(get(r, "unit"));
    const m = qraw && qraw.match(qtyUnitCellRe);
    if (m) {
      q = toNum(m[1]);
      if (m[2] && !u) u = normUnit(m[2]);
    }
    const sr = get(r, "sr");
    const rate = roles.includes("rate") ? toNum(get(r, "rate")) : null;
    const full = [desc, ...extras].filter(Boolean).join(" · ").replace(/\s*\n\s*/g, "\n");
    if (!full && q == null) {
      skipped++;
      return;
    }
    if (!sr && q == null && items.length && rate == null) {
      const next = body[ri + 1];
      const nextIsItem = !!next && (!!get(next, "sr") || toNum(get(next, "qty")) != null);
      const caps = !!desc && desc === desc.toUpperCase() && /[A-Z]/.test(desc) && desc.length < 50;
      if (caps && nextIsItem) {
        items.push({ desc: full, heading: true });
        return;
      }
      const prev = items[items.length - 1];
      if (!prev.heading) {
        prev.desc += "\n" + full;
        joined++;
        return;
      }
    }
    if (!sr && q == null && !items.length) {
      const nx = body[ri + 1];
      if (desc && desc === desc.toUpperCase() && /[A-Z]/.test(desc) && nx) {
        items.push({ desc: full, heading: true });
        return;
      }
    }
    items.push({ desc: full, qty: q == null ? 1 : q, unit: u || "Nos.", rate, flag: q == null });
  });
  if (hdrSkip) notes.push(`${hdrSkip} repeated header row${hdrSkip > 1 ? "s" : ""} skipped`);
  if (totalRows) notes.push(`${totalRows} total row${totalRows > 1 ? "s" : ""} skipped`);
  if (joined) notes.push(`${joined} continuation line${joined > 1 ? "s" : ""} joined to the item above`);
  void skipped;
  const cols = labels.map((l, i) => ({ label: l, role: (roles[i] === "ignore-rate" ? "ignore" : roles[i]) as Role }));
  return { mode: "grid", header: !!header, cols, items, notes };
}

// ---------- free text (email) ----------

const unitTailRe = new RegExp(
  `(?:^|[\\s\\-–—:,(])([\\d,]+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})\\.?(?=[\\s).,]*$)`,
  "i",
);
const qtyWordRe = /(?:qty|quantity)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*([a-z]+\.?)?\s*$/i;
const dashRe = /\s[\-–—]\s*([\d,]+(?:\.\d+)?)\s*$/;
const numRe = /^\s*(?:\(?\d{1,3}[.)\-:]|[-*•▪●])\s+/;

function analyseText(text: string): Omit<PasteResult, "source" | "enquiry"> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const anyNum = lines.some((r) => numRe.test(r));
  const raw: { t: string }[] = [];
  let cur: { t: string } | null = null;
  for (const r of lines) {
    if (!r.trim()) {
      cur = null;
      continue;
    }
    if (anyNum && !numRe.test(r)) {
      if (cur) cur.t += " " + r.trim();
      continue;
    }
    cur = { t: r.replace(numRe, "").trim() };
    raw.push(cur);
  }
  const items: ParsedItem[] = raw.map((it) => {
    let s = it.t.replace(/\s+/g, " ").trim();
    let q: number | null = null;
    let u = "";
    let m: RegExpMatchArray | null;
    if ((m = s.match(qtyWordRe))) {
      q = toNum(m[1]);
      u = m[2] || "";
      s = s.slice(0, m.index);
    } else if ((m = s.match(unitTailRe))) {
      q = toNum(m[1]);
      u = m[2];
      s = s.slice(0, m.index! + (m[0].length - m[0].trimStart().length));
    } else if ((m = s.match(dashRe))) {
      q = toNum(m[1]);
      s = s.slice(0, m.index);
    }
    s = s.replace(/[\s,;:\-–—]+$/, "");
    return { desc: s, qty: q || 1, unit: normUnit(u) || "Nos.", flag: !q };
  });
  const notes: string[] = [];
  if (anyNum) notes.push("Numbered list detected — greeting and sign-off lines ignored.");
  return { mode: "text", header: false, cols: [], items, notes };
}

export function findEnquiryRef(text: string): string | null {
  const m = text.match(
    /\b(?:enq(?:uiry)?|rfq|inquiry|pr|mr)\s*(?:no\.?|ref(?:erence)?\.?|#|number)?\s*[:#\-]?\s*([A-Z]{2,}[A-Z0-9\-\/]*\d[A-Z0-9\-\/]*)/i,
  );
  return m ? m[1] : null;
}

/** Entry point. `overrides` maps column index → role chosen by the user in the preview. */
export function analysePaste(input: PasteInput, overrides?: Record<number, Role>): PasteResult {
  const text = input.text || "";
  let rows: string[][] | null = null;
  let source = "";
  if (input.rows) {
    rows = input.rows;
    source = input.source || "Spreadsheet file";
  }
  if (!rows && input.html) {
    rows = rowsFromHTML(input.html);
    if (rows && rows.length) source = input.source || "Excel cells (rich clipboard)";
    else rows = null;
  }
  if (!rows && text.includes("\t")) {
    rows = rowsFromTSV(text);
    source = "Excel cells (tab-separated)";
  }
  const res = rows ? analyseGrid(rows, overrides) : analyseText(text);
  const enqSrc = text || (rows ? rows.slice(0, 6).map((r) => r.join(" ")).join("\n") : "");
  return { ...res, source: rows ? source : input.source || "Text list (email / notes)", enquiry: findEnquiryRef(enqSrc) };
}

/** A single column of numbers pasted into the Rate column (costing done in Excel). */
export function parseNumberColumn(text: string): (number | null)[] | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  if (!lines.length || lines.some((l) => l.includes("\t"))) return null;
  const vals = lines.map((l) => (l.trim() === "" ? null : toNum(l.replace(/[^\d.,\-]/g, ""))));
  const ok = lines.every((l, i) => l.trim() === "" || vals[i] != null);
  return ok ? vals : null;
}
