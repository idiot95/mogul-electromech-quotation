import type { Line } from "../../lib/types";
import type { ParsedItem } from "../../../../shared/paste-engine";
import { round2 } from "../../lib/format";

/** A line as edited in the grid: numbers kept as text so typing "1." or "" works naturally. */
export interface EditLine {
  key: string;
  kind: "item" | "heading";
  description: string;
  qty: string;
  unit: string;
  rate: string;
}

let seq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankLine = (unit = "Nos."): EditLine => ({ key: newKey(), kind: "item", description: "", qty: "", unit, rate: "" });
export const headingLine = (text = ""): EditLine => ({ key: newKey(), kind: "heading", description: text, qty: "", unit: "", rate: "" });

export function parseNum(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const numText = (n: number | null | undefined) => (n == null ? "" : String(n));

export function fromLines(lines: Line[]): EditLine[] {
  return lines.map((l) => ({
    key: newKey(),
    kind: l.kind,
    description: l.description || "",
    qty: numText(l.qty),
    unit: l.unit || "",
    rate: numText(l.rate),
  }));
}

export function toLines(lines: EditLine[]): Line[] {
  return lines
    .filter((l) => l.description.trim() || l.qty.trim() || l.rate.trim())
    .map((l) =>
      l.kind === "heading"
        ? { kind: "heading", description: l.description.trim(), qty: null, unit: null, rate: null }
        : { kind: "item", description: l.description.trim(), qty: parseNum(l.qty), unit: l.unit.trim() || null, rate: parseNum(l.rate) },
    );
}

export function fromParsed(items: ParsedItem[], defaultUnit: string): EditLine[] {
  return items.map((it) =>
    it.heading
      ? headingLine(it.desc)
      : {
          key: newKey(),
          kind: "item",
          description: it.desc,
          qty: it.qty == null ? "" : String(it.qty),
          unit: it.unit || defaultUnit,
          rate: it.rate == null ? "" : String(it.rate),
        },
  );
}

export const isBlank = (l: EditLine) => !l.description.trim() && !l.qty.trim() && !l.rate.trim();

export function lineAmount(l: EditLine): number | null {
  if (l.kind !== "item") return null;
  const q = parseNum(l.qty);
  const r = parseNum(l.rate);
  return q != null && r != null ? round2(q * r) : null;
}

export function computeTotals(lines: EditLine[], vatRate: number) {
  const items = lines.filter((l) => l.kind === "item" && !isBlank(l));
  const subtotal = round2(items.reduce((s, l) => s + (lineAmount(l) ?? 0), 0));
  const vat = round2((subtotal * vatRate) / 100);
  const missingRate = items.filter((l) => parseNum(l.rate) == null).length;
  return { subtotal, vat, total: round2(subtotal + vat), count: items.length, missingRate };
}
