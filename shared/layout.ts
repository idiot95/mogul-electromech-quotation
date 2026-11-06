// Mogul Workspace · table layout from positioned words (core service)
//
// PDFs and screenshots give words with positions but no table structure. This rebuilds the rows and
// columns so the paste engine can read them like Excel cells:
//   1. words → lines (same vertical band)
//   2. line → cells (split where the horizontal gap is clearly wider than the document's word spacing)
//   3. cells → columns (column spans learned from the lines that have the most cells, i.e. the table rows)
//   4. free text below the table ("Kindly quote your best price…") is left out

export interface Box {
  text: string;
  x0: number;
  y0: number; // top
  x1: number;
  y1: number; // bottom
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Groups words into text lines, top to bottom. */
export function linesFromBoxes(boxes: Box[]): Box[][] {
  const words = boxes.filter((b) => b.text.trim() !== "" && b.y1 > b.y0);
  if (!words.length) return [];
  const h = median(words.map((w) => w.y1 - w.y0)) || 1;
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines: { mid: number; words: Box[] }[] = [];
  for (const w of sorted) {
    const mid = (w.y0 + w.y1) / 2;
    const line = lines[lines.length - 1];
    if (line && Math.abs(mid - line.mid) <= h * 0.5) {
      line.words.push(w);
      line.mid = (line.mid * (line.words.length - 1) + mid) / line.words.length;
    } else lines.push({ mid, words: [w] });
  }
  return lines.map((l) => l.words.sort((a, b) => a.x0 - b.x0));
}

/** Splits one line into cells at gaps wider than `gap`; words closer than a space are joined without one. */
function cellsOf(words: Box[], gap: number, space: number): Cell[] {
  const cells: Cell[] = [];
  for (const w of words) {
    const c = cells[cells.length - 1];
    const d = c ? w.x0 - c.x1 : Infinity;
    if (c && d <= gap) {
      c.text += (d > space ? " " : "") + w.text.trim();
      c.x1 = Math.max(c.x1, w.x1);
    } else cells.push({ text: w.text.trim(), x0: w.x0, x1: w.x1 });
  }
  return cells;
}

/**
 * The gap that separates columns: word spaces and column gaps form two groups; split at the biggest jump between them.
 * Tight tables (a few px of cell padding) still split, ordinary word spacing never does.
 */
function columnGap(lines: Box[][], h: number, fallback: number): number {
  const gaps: number[] = [];
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    const g = l[i].x0 - l[i - 1].x1;
    if (g > h * 0.15) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  let best = h * fallback;
  let ratio = 1.6; // a jump smaller than this isn't a clear split
  for (let i = 0; i + 1 < gaps.length; i++) {
    const lo = Math.max(gaps[i], h * 0.2);
    const r = gaps[i + 1] / lo;
    if (r > ratio && gaps[i + 1] >= h * 0.45 && gaps[i] <= h * 1.2) {
      ratio = r;
      best = (gaps[i] + gaps[i + 1]) / 2;
    }
  }
  return Math.min(Math.max(best, h * 0.4), h * 1.5);
}

/** All the text, line by line (for spotting the enquiry reference above or below the table). */
export function textFromBoxes(boxes: Box[]): string {
  return linesFromBoxes(boxes)
    .map((l) => l.map((w) => w.text.trim()).join(" "))
    .join("\n");
}

/**
 * Positioned words → rows of cell text, columns aligned across rows.
 * `fallbackGap` (× text height) is used when the gaps don't fall into two clear groups: OCR words need a wide gap
 * to start a new cell; PDF text blocks usually hold a whole cell already, so a smaller gap is enough.
 */
export function rowsFromBoxes(boxes: Box[], fallbackGap = 1.1): string[][] {
  const lines = linesFromBoxes(boxes);
  if (!lines.length) return [];
  const h = median(lines.flat().map((w) => w.y1 - w.y0)) || 1;
  const gap = columnGap(lines, h, fallbackGap);
  const cellLines = lines.map((l) => cellsOf(l, gap, h * 0.15));

  // Column spans: from the lines with the most common multi-cell count (the body of the table).
  const counts = new Map<number, number>();
  for (const cl of cellLines) if (cl.length >= 2) counts.set(cl.length, (counts.get(cl.length) ?? 0) + 1);
  if (!counts.size) return cellLines.map((cl) => cl.map((c) => c.text));
  const best = Math.max(...counts.values());
  const n = Math.max(...[...counts].filter(([, v]) => v === best).map(([k]) => k));
  const spans: { x0: number; x1: number }[] = Array.from({ length: n }, () => ({ x0: Infinity, x1: -Infinity }));
  for (const cl of cellLines) {
    if (cl.length !== n) continue;
    cl.forEach((c, i) => {
      spans[i].x0 = Math.min(spans[i].x0, c.x0);
      spans[i].x1 = Math.max(spans[i].x1, c.x1);
    });
  }

  const colOf = (c: Cell) => {
    let bestI = 0;
    let bestScore = -Infinity;
    spans.forEach((s, i) => {
      const overlap = Math.min(c.x1, s.x1) - Math.max(c.x0, s.x0);
      const dist = Math.abs((c.x0 + c.x1) / 2 - (s.x0 + s.x1) / 2);
      const score = overlap > 0 ? overlap : -dist;
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    });
    return bestI;
  };

  const rows = cellLines.map((cl) => {
    const row = Array<string>(n).fill("");
    for (const c of cl) {
      const i = colOf(c);
      row[i] = row[i] ? `${row[i]} ${c.text}` : c.text;
    }
    return row;
  });
  // A line of running text crosses several columns; after the last table row it is a closing remark, not an item.
  const spansCrossed = (cl: Cell[]) => spans.filter((s) => cl.some((c) => Math.min(c.x1, s.x1) - Math.max(c.x0, s.x0) > 0)).length;
  let end = rows.length;
  while (end > 0 && rows[end - 1].filter(Boolean).length <= 1 && spansCrossed(cellLines[end - 1]) >= 2) end--;
  return rows.slice(0, end);
}
