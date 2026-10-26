// Read .xlsx / .xls / .csv files into rows of strings (SheetJS, loaded on demand).
export async function readSheetFile(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
  return rows.map((r) => r.map((c) => (c == null ? "" : String(c))));
}
