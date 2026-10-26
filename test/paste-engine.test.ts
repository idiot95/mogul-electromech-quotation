import { describe, expect, it } from "vitest";
import { analysePaste, parseNumberColumn } from "../shared/paste-engine";
import { amountInWords } from "../web/src/lib/format";

// Sample enquiries. Add real ones from the sales team to test/paste-cases/ as they come in.
const EXCEL =
  "S.No\tPart No.\tDescription\tMake\tQty\tUOM\tUnit Price\tRemarks\n1\tCB-2532\tCarbon brush 25 x 32 x 60 mm\tHatim Carbon\t60\tNos\t\tAs per drawing\n2\t\tBrush holder for TECO motor 3800 kW\tTECO\t12\tNos\t\t\n3\tSKF-6316\tBearing 6316 C3\tSKF\t4\tNos\t\t\n4\t\tCopper braided flexible 50 sqmm\t\t30\tMtrs\t\t";
const MESSY =
  'ENQUIRY NO: SSD2600032\t\t\t\nSl\tItem Description\tQty\tUnit\n\tMOTOR SPARES\t\t\n1\t"Carbon brush 25 x 32 x 60 mm\nMake: Hatim Carbon"\t60\tNos.\n2\tBrush holder, TECO 3800 kW\t12\tNos.\n\tSuitable for 11 kV motor\t\t\nSl\tItem Description\tQty\tUnit\n3\tSlip ring insulation sleeve\t2\tSets\n4\tCopper braided flexible 50 sqmm\t30 mtrs\t\n\tTotal\t104\t';
const NOHEADER =
  "Carbon brush 25 x 32 x 60 mm, Hatim Carbon\t60\tNos.\nBrush holder for TECO motor 3800 kW\t12\tNos.\nBearing 6316 C3, SKF\t4\tNos.";
const EMAIL =
  "Dear Sir,\nPlease quote your best price for the following against our Enquiry SSD2600032:\n\n1. Carbon brush 25 x 32 x 60 mm, Make: Hatim Carbon - 60 nos\n2. Brush holder for TECO motor 3800 kW – 12 nos\n3. Slip ring insulation sleeve, 11 kV rated\n   size as per attached drawing - 2 sets\n4. Bearing 6316 C3, SKF qty 4\n5. Copper braided flexible 50 sqmm 30 mtrs\n\nRegards,\nPurchase Dept.";

const items = (r: ReturnType<typeof analysePaste>) => r.items.filter((i) => !i.heading);

describe("paste engine", () => {
  it("reads Excel with extra columns, folds Part No/Make/Remarks into the description, ignores price", () => {
    const r = analysePaste({ text: EXCEL });
    const it = items(r);
    expect(it).toHaveLength(4);
    expect(it[0]).toMatchObject({ qty: 60, unit: "Nos." });
    expect(it[0].desc).toContain("Carbon brush 25 x 32 x 60 mm");
    expect(it[0].desc).toContain("Make: Hatim Carbon");
    expect(it[0].desc).toContain("Part No: CB-2532");
    expect(it[3]).toMatchObject({ qty: 30, unit: "Mtr" });
    expect(it.every((i) => i.rate == null)).toBe(true);
  });

  it("handles a messy export: banner, section heading, multi-line cells, repeated header, continuation, total", () => {
    const r = analysePaste({ text: MESSY });
    expect(r.enquiry).toBe("SSD2600032");
    expect(r.items[0]).toMatchObject({ heading: true, desc: "MOTOR SPARES" });
    const it = items(r);
    expect(it).toHaveLength(4);
    expect(it[0].desc).toContain("Make: Hatim Carbon");
    expect(it[1].desc).toContain("Suitable for 11 kV motor");
    expect(it[2]).toMatchObject({ qty: 2, unit: "Set" });
    expect(it[3]).toMatchObject({ qty: 30, unit: "Mtr" });
    expect(r.notes.join(" ")).toMatch(/total row/);
  });

  it("maps columns by content when there is no header", () => {
    const it = items(analysePaste({ text: NOHEADER }));
    expect(it).toHaveLength(3);
    expect(it[1]).toMatchObject({ qty: 12, unit: "Nos." });
  });

  it("reads a numbered list from an email, ignoring greeting and sign-off", () => {
    const r = analysePaste({ text: EMAIL });
    const it = items(r);
    expect(r.mode).toBe("text");
    expect(r.enquiry).toBe("SSD2600032");
    expect(it).toHaveLength(5);
    expect(it[0]).toMatchObject({ qty: 60, unit: "Nos." });
    expect(it[0].desc).toBe("Carbon brush 25 x 32 x 60 mm, Make: Hatim Carbon");
    expect(it[2]).toMatchObject({ qty: 2, unit: "Set" });
    expect(it[2].desc).toContain("size as per attached drawing");
    expect(it[3]).toMatchObject({ qty: 4 });
    expect(it[4]).toMatchObject({ qty: 30, unit: "Mtr" });
  });

  it("imports a price column only when the user maps it to Rate", () => {
    const r = analysePaste({ text: "Description\tQty\tUnit Price\nBearing\t4\t125.50" }, { 2: "rate" });
    expect(items(r)[0].rate).toBe(125.5);
  });

  it("reads tabular rows from a spreadsheet file", () => {
    const r = analysePaste({ rows: [["Sl", "Description", "Qty", "Unit"], ["1", "Carbon brush", "10", "pcs"]] });
    expect(items(r)[0]).toMatchObject({ desc: "Carbon brush", qty: 10, unit: "Pcs" });
  });

  it("detects a pasted column of rates", () => {
    expect(parseNumberColumn("110\n1,250.50\n\n45\n")).toEqual([110, 1250.5, null, 45]);
    expect(parseNumberColumn("abc\n12")).toBeNull();
  });
});

describe("amount in words", () => {
  it("matches the template wording", () => {
    expect(amountInWords(6930)).toBe("UAE Dirhams six thousand nine hundred thirty only");
    expect(amountInWords(1250.5)).toBe("UAE Dirhams one thousand two hundred fifty and fifty fils only");
  });
});
