// Read .xlsx / .xls / .csv files into rows of strings (SheetJS, loaded on demand).
export async function readSheetFile(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
  return rows.map((r) => r.map((c) => (c == null ? "" : String(c))));
}

/** Download rows as an .xlsx workbook (SheetJS, loaded on demand). `widths` are column widths in characters. */
export async function downloadSheet(fileName: string, sheetName: string, rows: (string | number | null)[][], widths?: number[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
