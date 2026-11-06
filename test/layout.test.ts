import { describe, expect, it } from "vitest";
import { rowsFromBoxes, type Box } from "../shared/layout";
import { analysePaste } from "../shared/paste-engine";

// Lay out words the way a PDF or OCR would report them: x positions per column, 12px high text, 20px line pitch.
function page(lines: [number, string][][]): Box[] {
  const out: Box[] = [];
  lines.forEach((cells, li) => {
    const y = 40 + li * 20;
    for (const [x, text] of cells) {
      let cx = x;
      for (const w of text.split(" ")) {
        const wd = w.length * 6;
        out.push({ text: w, x0: cx, x1: cx + wd, y0: y, y1: y + 12 });
        cx += wd + 3; // a space
      }
    }
  });
  return out;
}

describe("table layout from positioned words", () => {
  const enquiry = page([
    [[50, "PURCHASE ENQUIRY No: SSD2600032"]],
    [[50, "Sl"], [90, "Description"], [400, "Qty"], [460, "Unit"]],
    [[50, "1"], [90, "Carbon brush 25 x 32 x 60 mm"], [404, "60"], [460, "Nos"]],
    [[90, "Make: Hatim Carbon"]],
    [[50, "2"], [90, "Brush holder for TECO motor"], [404, "12"], [460, "Nos"]],
    [[50, "3"], [90, "Bearing 6316 C3"], [410, "4"], [460, "Nos"]],
  ]);

  it("rebuilds rows and aligned columns", () => {
    const rows = rowsFromBoxes(enquiry);
    expect(rows[1]).toEqual(["Sl", "Description", "Qty", "Unit"]);
    expect(rows[2]).toEqual(["1", "Carbon brush 25 x 32 x 60 mm", "60", "Nos"]);
    expect(rows[3]).toEqual(["", "Make: Hatim Carbon", "", ""]);
    expect(rows[5]).toEqual(["3", "Bearing 6316 C3", "4", "Nos"]);
  });

  it("feeds the paste engine: header found, wrapped line joined, enquiry ref spotted", () => {
    const rows = rowsFromBoxes(enquiry);
    const r = analysePaste({ rows, source: "PDF" });
    const items = r.items.filter((i) => !i.heading);
    expect(r.source).toBe("PDF");
    expect(items).toHaveLength(3);
    expect(items[0].desc).toContain("Carbon brush");
    expect(items[0].desc).toContain("Hatim Carbon");
    expect(items[0].qty).toBe(60);
    expect(items[2].qty).toBe(4);
    expect(r.enquiry).toBe("SSD2600032");
  });

  it("splits tightly spaced columns and leaves out the remark under the table", () => {
    const tight = page([
      [[50, "S.No"], [86, "Description"], [300, "Part No."], [354, "Qty"], [378, "UOM"]],
      [[50, "1"], [86, "Carbon brush 25 x 32"], [300, "CB-2532"], [354, "60"], [378, "NOS"]],
      [[50, "2"], [86, "Bearing 6316 C3"], [300, "SKF-6316"], [354, "4"], [378, "NOS"]],
      [[50, "3"], [86, "Copper braided flexible"], [354, "30"], [378, "MTR"]],
      [[50, "Kindly quote your best price and delivery."]],
    ]);
    const rows = rowsFromBoxes(tight);
    expect(rows[0]).toEqual(["S.No", "Description", "Part No.", "Qty", "UOM"]);
    expect(rows[2]).toEqual(["2", "Bearing 6316 C3", "SKF-6316", "4", "NOS"]);
    expect(rows[3]).toEqual(["3", "Copper braided flexible", "", "30", "MTR"]);
    expect(rows).toHaveLength(4);
  });

  it("reads a PDF whose text blocks are whole cells (no word gaps to compare)", () => {
    const b = (text: string, x0: number, x1: number, y: number): Box => ({ text, x0, x1, y0: y - 11.5, y1: y });
    const pdf = [
      b("S.No", 32.4, 58.6, 93.6), b("Material Description", 112.1, 222.2, 93.6), b("Part No.", 279.5, 323.7, 93.6), b("Qty", 336.9, 356.1, 93.6), b("UOM", 365.5, 392.4, 93.6),
      b("1", 32.4, 38.8, 115.9), b("Carbon brush 25 x 32 x 60 mm", 68, 226.2, 115.9), b("CB-2532", 275.7, 321.2, 115.9), b("60", 336.9, 349.7, 115.9), b("NOS", 365.5, 390.5, 115.9),
      b("3", 32.4, 38.8, 160.6), b("Bearing 6316 C3", 68, 154.5, 160.6), b("SKF-6316", 275.7, 327.6, 160.6), b("4", 336.9, 343.3, 160.6), b("NOS", 365.5, 390.5, 160.6),
    ];
    expect(rowsFromBoxes(pdf, 0.5)).toEqual([
      ["S.No", "Material Description", "Part No.", "Qty", "UOM"],
      ["1", "Carbon brush 25 x 32 x 60 mm", "CB-2532", "60", "NOS"],
      ["3", "Bearing 6316 C3", "SKF-6316", "4", "NOS"],
    ]);
  });

  it("joins characters that a PDF reports one by one", () => {
    const chars: Box[] = "Bearing".split("").map((ch, i) => ({ text: ch, x0: 10 + i * 6, x1: 16 + i * 6, y0: 0, y1: 12 }));
    expect(rowsFromBoxes(chars)).toEqual([["Bearing"]]);
  });
});
