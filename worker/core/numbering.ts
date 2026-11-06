// Numbering service: one running counter per series per year.
// ME-{YY}-{NNN} -> ME-26-001, ME-26-002 ... (resets each calendar year).

export async function nextNumber(db: D1Database, series: string, date: string): Promise<string> {
  const yy = Number(date.slice(2, 4));
  const row = await db
    .prepare(
      `INSERT INTO number_series (series, year, last) VALUES (?, ?, 1)
       ON CONFLICT(series, year) DO UPDATE SET last = last + 1
       RETURNING last`,
    )
    .bind(series, yy)
    .first<{ last: number }>();
  const n = row!.last;
  return `${series}-${String(yy).padStart(2, "0")}-${String(n).padStart(3, "0")}`;
}
