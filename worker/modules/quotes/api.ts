import { Hono } from "hono";
import type { AppContext } from "../../env";
import { body, bad, intParam, notFound, num, round2, str } from "../../core/util";
import { getSetting } from "../../core/settings";
import { nextNumber } from "../../core/numbering";

export const STATUSES = ["draft", "printed", "emailed", "won", "partly_won", "lost", "cancelled"] as const;
/** Statuses that can be set directly; won / partly won follow from the orders recorded, lost goes through /lost. */
const MANUAL_STATUSES = ["draft", "printed", "emailed", "cancelled"];
const LOST_REASONS = ["Price", "Delivery time", "No response", "Went to competitor", "Brand / spec", "Enquiry cancelled", "Other"];

const HEADER_FIELDS = [
  "quote_date", "customer_id", "customer_name", "customer_address", "attention", "enquiry_ref",
  "salesman_id", "payment_terms", "validity", "delivery_terms", "vat_terms", "vat_rate",
  "notes", "internal_notes",
] as const;

type LineIn = { kind?: string; description?: unknown; qty?: unknown; unit?: unknown; rate?: unknown };
type QuoteIn = Record<string, unknown> & { lines?: LineIn[] };

interface QuoteRow {
  id: number;
  base_number: string;
  rev: number;
  status: string;
  superseded_by: number | null;
  [k: string]: unknown;
}

const today = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10); // UAE (UTC+4)

function cleanLines(lines: LineIn[] | undefined) {
  if (!Array.isArray(lines)) return [];
  if (lines.length > 1000) throw bad("Too many lines (max 1000)");
  return lines
    .map((l) => {
      const kind = l.kind === "heading" ? "heading" : "item";
      const description = str(l.description, 10000) ?? "";
      if (kind === "heading") return { kind, description, qty: null, unit: null, rate: null, amount: null };
      const qty = num(l.qty);
      const rate = num(l.rate);
      const amount = qty != null && rate != null ? round2(qty * rate) : null;
      return { kind, description, qty, unit: str(l.unit, 40), rate, amount };
    })
    .filter((l) => l.description !== "" || l.qty != null || l.rate != null);
}

function header(b: QuoteIn, defaults: { vatRate: number }) {
  const date = str(b.quote_date, 10) || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad("quote_date must be YYYY-MM-DD");
  const vat = num(b.vat_rate);
  return {
    quote_date: date,
    customer_id: num(b.customer_id),
    customer_name: str(b.customer_name, 300) ?? "",
    customer_address: str(b.customer_address, 2000),
    attention: str(b.attention, 300),
    enquiry_ref: str(b.enquiry_ref, 200),
    salesman_id: num(b.salesman_id),
    payment_terms: str(b.payment_terms, 500),
    validity: str(b.validity, 200),
    delivery_terms: str(b.delivery_terms, 500),
    vat_terms: str(b.vat_terms, 300),
    vat_rate: vat == null ? defaults.vatRate : vat,
    notes: str(b.notes, 5000),
    internal_notes: str(b.internal_notes, 5000),
  };
}

function totals(lines: ReturnType<typeof cleanLines>, vatRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
  const vat_amount = round2((subtotal * vatRate) / 100);
  return { subtotal, vat_amount, total: round2(subtotal + vat_amount) };
}

/** Line inserts; `guard` is an SQL condition that must hold (e.g. the quote is still editable). */
function lineInserts(db: D1Database, idSql: string, idArgs: unknown[], lines: ReturnType<typeof cleanLines>, guard = "1", guardArgs: unknown[] = []) {
  return lines.map((l, i) =>
    db
      .prepare(`INSERT INTO q_lines (quote_id, pos, kind, description, qty, unit, rate, amount) SELECT ${idSql}, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
      .bind(...idArgs, i + 1, l.kind, l.description, l.qty, l.unit, l.rate, l.amount, ...guardArgs),
  );
}

/**
 * The statements that read a whole quote. `idSql` is "?" (bound to `args`) or an SQL expression, so a write can append
 * them to its own batch and the save + reload costs one database round trip.
 */
function loadStatements(db: D1Database, idSql: string, args: unknown[]) {
  const q = (sql: string, n: number) => db.prepare(sql.replaceAll("$ID", idSql)).bind(...Array.from({ length: n }, () => args).flat());
  return [
    q(
      `SELECT q.*, s.name AS salesman_name, s.email AS salesman_email, s.phone AS salesman_phone,
              s.email_template AS salesman_email_template, c.email AS customer_email
       FROM q_quotes q
       LEFT JOIN salesmen s ON s.id = q.salesman_id
       LEFT JOIN customers c ON c.id = q.customer_id
       WHERE q.id = $ID`,
      1,
    ),
    q("SELECT * FROM q_lines WHERE quote_id = $ID ORDER BY pos", 1),
    q("SELECT * FROM q_emails WHERE quote_id = $ID ORDER BY id DESC", 1),
    q("SELECT id, rev, status, quote_date, total FROM q_quotes WHERE base_number = (SELECT base_number FROM q_quotes WHERE id = $ID) ORDER BY rev", 1),
    q("SELECT * FROM q_orders WHERE quote_id = $ID ORDER BY COALESCE(po_date, created_at), id", 1),
    q("SELECT ol.* FROM q_order_lines ol JOIN q_orders o ON o.id = ol.order_id WHERE o.quote_id = $ID ORDER BY ol.order_id, ol.pos", 1),
    q("SELECT f.id, f.name, f.mime, f.size, f.created_at, f.owner_id FROM files f JOIN q_orders o ON o.id = f.owner_id WHERE f.owner_type = 'q_order' AND o.quote_id = $ID", 1),
  ];
}
const LOAD_COUNT = 7;

/** Builds the quote from the results of loadStatements (the last LOAD_COUNT results of a batch). */
function assemble(results: D1Result[]) {
  const [quote, lines, emails, revisions, orders, orderLines, poFiles] = results.slice(-LOAD_COUNT);
  const q = quote.results[0] as QuoteRow | undefined;
  if (!q) throw notFound("Quote not found");
  type OL = { order_id: number };
  type OF = { owner_id: number };
  return {
    ...q,
    lines: lines.results,
    emails: emails.results,
    revisions: revisions.results,
    orders: (orders.results as { id: number }[]).map((o) => ({
      ...o,
      lines: (orderLines.results as OL[]).filter((l) => l.order_id === o.id),
      files: (poFiles.results as OF[]).filter((f) => f.owner_id === o.id),
    })),
  };
}

async function loadQuote(db: D1Database, id: number) {
  return assemble(await db.batch(loadStatements(db, "?", [id])));
}

type OrderLineIn = { pos?: unknown; qty?: unknown; rate?: unknown };

/** Validates PO lines against the quote's item lines (matched by position) and snapshots what was quoted. */
async function orderLines(db: D1Database, quoteId: number, input: OrderLineIn[] | undefined) {
  if (!Array.isArray(input)) throw bad("lines required");
  const { results: quoted } = await db
    .prepare("SELECT pos, description, unit, qty, rate FROM q_lines WHERE quote_id = ? AND kind = 'item'")
    .bind(quoteId)
    .all<{ pos: number; description: string; unit: string | null; qty: number | null; rate: number | null }>();
  const byPos = new Map(quoted.map((l) => [l.pos, l]));
  const out = [];
  for (const l of input) {
    const q = byPos.get(Number(l.pos));
    const qty = num(l.qty);
    if (!q || qty == null || qty <= 0) continue;
    const rate = num(l.rate) ?? q.rate;
    out.push({ pos: q.pos, description: q.description, unit: q.unit, quoted_qty: q.qty, quoted_rate: q.rate, qty, rate, amount: rate == null ? null : round2(qty * rate) });
  }
  if (!out.length) throw bad("Tick at least one line with an ordered quantity.");
  return out;
}

function orderHeader(b: Record<string, unknown>) {
  const po_date = str(b.po_date, 10);
  if (po_date && !/^\d{4}-\d{2}-\d{2}$/.test(po_date)) throw bad("po_date must be YYYY-MM-DD");
  return { po_number: str(b.po_number, 100), po_date, note: str(b.note, 2000) };
}

function orderWrites(db: D1Database, orderId: number, lines: Awaited<ReturnType<typeof orderLines>>) {
  return [
    db.prepare("DELETE FROM q_order_lines WHERE order_id = ?").bind(orderId),
    ...lines.map((l) =>
      db
        .prepare("INSERT INTO q_order_lines (order_id, pos, description, unit, quoted_qty, quoted_rate, qty, rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(orderId, l.pos, l.description, l.unit, l.quoted_qty, l.quoted_rate, l.qty, l.rate, l.amount),
    ),
  ];
}

/** Sets won / partly won from the orders recorded; with no orders left the quote goes back to sent (or printed). */
async function refreshOutcome(db: D1Database, id: number) {
  const [lines, ordered, emails] = await db.batch([
    db.prepare("SELECT pos, qty FROM q_lines WHERE quote_id = ? AND kind = 'item'").bind(id),
    db.prepare("SELECT ol.pos, SUM(ol.qty) AS qty FROM q_order_lines ol JOIN q_orders o ON o.id = ol.order_id WHERE o.quote_id = ? GROUP BY ol.pos").bind(id),
    db.prepare("SELECT COUNT(*) AS n FROM q_emails WHERE quote_id = ?").bind(id),
  ]);
  const got = new Map((ordered.results as { pos: number; qty: number }[]).map((r) => [r.pos, r.qty]));
  let status: string;
  if (got.size) {
    const all = (lines.results as { pos: number; qty: number | null }[]).every((l) => (got.get(l.pos) ?? 0) >= (l.qty ?? 0) && got.has(l.pos));
    status = all ? "won" : "partly_won";
  } else status = (emails.results[0] as { n: number }).n ? "emailed" : "printed";
  await db
    .prepare("UPDATE q_quotes SET status = ?, lost_reason = NULL, lost_note = NULL, outcome_at = CASE WHEN ? THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?")
    .bind(status, got.size ? 1 : 0, id)
    .run();
}

async function getOpenForOutcome(db: D1Database, id: number) {
  const q = await getForWrite(db, id);
  if (q.superseded_by) throw bad("Record orders on the latest revision.");
  if (q.status === "cancelled") throw bad("Re-open the cancelled quote first.");
  return q;
}

async function getForWrite(db: D1Database, id: number) {
  const q = await db.prepare("SELECT * FROM q_quotes WHERE id = ?").bind(id).first<QuoteRow>();
  if (!q) throw notFound("Quote not found");
  return q;
}

export const quotesApi = new Hono<AppContext>()
  // ---- list & search ----
  .get("/", async (c) => {
    const q = (c.req.query("q") || "").trim();
    const status = c.req.query("status") || "";
    const customerId = Number(c.req.query("customer_id")) || 0;
    const salesmanId = Number(c.req.query("salesman_id")) || 0;
    const from = c.req.query("from") || "";
    const to = c.req.query("to") || "";
    const allRevs = c.req.query("all_revisions") === "1";
    const limit = Math.min(Number(c.req.query("limit")) || 200, 1000);
    const where: string[] = [];
    const args: unknown[] = [];
    if (!allRevs) where.push("q.superseded_by IS NULL");
    if (q) {
      where.push(
        `(q.base_number LIKE ? OR q.customer_name LIKE ? OR q.enquiry_ref LIKE ?
          OR EXISTS (SELECT 1 FROM q_lines l WHERE l.quote_id = q.id AND l.description LIKE ?))`,
      );
      args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status === "open") where.push("q.status IN ('printed', 'emailed')");
    else if (status === "ordered") where.push("q.status IN ('won', 'partly_won')");
    else if (STATUSES.includes(status as never)) {
      where.push("q.status = ?");
      args.push(status);
    }
    if (customerId) {
      where.push("q.customer_id = ?");
      args.push(customerId);
    }
    if (salesmanId) {
      where.push("q.salesman_id = ?");
      args.push(salesmanId);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      where.push("q.quote_date >= ?");
      args.push(from);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.push("q.quote_date <= ?");
      args.push(to);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT q.id, q.base_number, q.rev, q.quote_date, q.status, q.customer_id, q.customer_name, q.enquiry_ref,
              q.salesman_id, s.name AS salesman_name, q.subtotal, q.total, q.currency, q.superseded_by, q.updated_at,
              (SELECT COUNT(*) FROM q_lines l WHERE l.quote_id = q.id AND l.kind = 'item') AS line_count,
              (SELECT COALESCE(SUM(o.subtotal), 0) FROM q_orders o WHERE o.quote_id = q.id) AS ordered_value,
              q.lost_reason
       FROM q_quotes q LEFT JOIN salesmen s ON s.id = q.salesman_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY q.quote_date DESC, q.id DESC LIMIT ?`,
    )
      .bind(...args, limit)
      .all();
    return c.json(results);
  })

  // ---- home widget: last N days ----
  .get("/summary", async (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days")) || 28, 1), 366);
    const since = new Date(Date.now() + 4 * 3600_000 - days * 86400_000).toISOString().slice(0, 10);
    const base = "FROM q_quotes q WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ?";
    const db = c.env.DB;
    const [kpi, byCustomer, largest, byStatus, bySalesman, received, followUp, lostWhy] = await db.batch([
      db.prepare(`SELECT COUNT(*) AS quotes, COALESCE(SUM(q.subtotal),0) AS amount, COUNT(DISTINCT q.customer_name) AS customers ${base}`).bind(since),
      db.prepare(`SELECT q.customer_name AS name, SUM(q.subtotal) AS amount, COUNT(*) AS quotes ${base} GROUP BY q.customer_name ORDER BY amount DESC LIMIT 8`).bind(since),
      db.prepare(
        `SELECT q.id, q.base_number, q.rev, q.customer_name, q.subtotal, q.status, s.name AS salesman_name
         FROM q_quotes q LEFT JOIN salesmen s ON s.id = q.salesman_id
         WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ?
         ORDER BY q.subtotal DESC LIMIT 6`,
      ).bind(since),
      db.prepare(`SELECT q.status, COUNT(*) AS quotes, SUM(q.subtotal) AS amount ${base} GROUP BY q.status`).bind(since),
      db.prepare(
        `SELECT COALESCE(s.name, 'Unassigned') AS name, COUNT(*) AS quotes, SUM(q.subtotal) AS amount
         FROM q_quotes q LEFT JOIN salesmen s ON s.id = q.salesman_id
         WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ?
         GROUP BY s.name ORDER BY amount DESC`,
      ).bind(since),
      // orders received in the period, whenever the quote was made
      db.prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(o.subtotal), 0) AS amount FROM q_orders o
         WHERE COALESCE(o.po_date, substr(o.created_at, 1, 10)) >= ?`,
      ).bind(since),
      // sent more than a week ago, no answer yet
      db.prepare(
        `SELECT q.id, q.base_number, q.rev, q.quote_date, q.customer_name, q.subtotal, q.status, s.name AS salesman_name
         FROM q_quotes q LEFT JOIN salesmen s ON s.id = q.salesman_id
         WHERE q.superseded_by IS NULL AND q.status IN ('printed', 'emailed') AND q.quote_date <= date(?, '-7 days') AND q.quote_date >= date(?, '-120 days')
         ORDER BY q.subtotal DESC LIMIT 8`,
      ).bind(today(), today()),
      db.prepare(`SELECT COALESCE(q.lost_reason, 'Other') AS name, COUNT(*) AS quotes, SUM(q.subtotal) AS amount ${base} AND q.status = 'lost' GROUP BY 1 ORDER BY amount DESC`).bind(since),
    ]);
    return c.json({
      since,
      days,
      kpi: kpi.results[0],
      byCustomer: byCustomer.results,
      largest: largest.results,
      byStatus: byStatus.results,
      bySalesman: bySalesman.results,
      received: received.results[0],
      followUp: followUp.results,
      lostWhy: lostWhy.results,
    });
  })

  .get("/:id", async (c) => c.json(await loadQuote(c.env.DB, intParam(c.req.param("id")))))

  // ---- create ----
  // One round trip: the next number, the quote, its lines and the reload run as one batch (a single transaction).
  .post("/", async (c) => {
    const b = await body<QuoteIn>(c);
    const h = header(b, { vatRate: 5 });
    const lines = cleanLines(b.lines);
    const t = totals(lines, h.vat_rate);
    const yy = Number(h.quote_date.slice(2, 4));
    const db = c.env.DB;
    const cfg = (k: string, d: string) => `COALESCE((SELECT json_extract(value, '$.${k}') FROM settings WHERE key = 'quotes'), '${d}')`;
    const series = cfg("series", "ME");
    const newId = "(SELECT MAX(id) FROM q_quotes)";
    const res = await db.batch([
      db
        .prepare(`INSERT INTO number_series (series, year, last) VALUES (${series}, ?, 1) ON CONFLICT(series, year) DO UPDATE SET last = last + 1`)
        .bind(yy),
      db
        .prepare(
          `INSERT INTO q_quotes (base_number, rev, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total)
           SELECT printf('%s-%02d-%03d', ns.series, ns.year, ns.last), 0, ${HEADER_FIELDS.map(() => "?").join(", ")}, ${cfg("currency", "AED")}, ?, ?, ?
           FROM number_series ns WHERE ns.series = ${series} AND ns.year = ?`,
        )
        .bind(...HEADER_FIELDS.map((f) => h[f]), t.subtotal, t.vat_amount, t.total, yy),
      ...lineInserts(db, newId, [], lines),
      ...loadStatements(db, newId, []),
    ]);
    return c.json(assemble(res), 201);
  })

  // ---- update (header + full line list, saved in one batch) ----
  // One round trip: every write is guarded by "still editable", and the reload rides in the same batch.
  .put("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const b = await body<QuoteIn>(c);
    const h = header(b, { vatRate: 5 });
    const lines = cleanLines(b.lines);
    const t = totals(lines, h.vat_rate);
    const db = c.env.DB;
    const editable = "EXISTS (SELECT 1 FROM q_quotes WHERE id = ? AND superseded_by IS NULL)";
    const res = await db.batch([
      db
        .prepare(
          `UPDATE q_quotes SET ${HEADER_FIELDS.map((f) => `${f} = ?`).join(", ")},
             subtotal = ?, vat_amount = ?, total = ?, updated_at = datetime('now') WHERE id = ? AND superseded_by IS NULL`,
        )
        .bind(...HEADER_FIELDS.map((f) => h[f]), t.subtotal, t.vat_amount, t.total, id),
      db.prepare(`DELETE FROM q_lines WHERE quote_id = ? AND ${editable}`).bind(id, id),
      ...lineInserts(db, "?", [id], lines, editable, [id]),
      ...loadStatements(db, "?", [id]),
    ]);
    const q = assemble(res);
    if (!res[0].meta.changes && q.superseded_by) throw bad("This revision has been superseded and is read-only. Open the latest revision.");
    return c.json(q);
  })

  // ---- status ----
  .post("/:id/status", async (c) => {
    const id = intParam(c.req.param("id"));
    const { status } = await body<{ status: string }>(c);
    if (!MANUAL_STATUSES.includes(status)) throw bad("Invalid status");
    const q = await getForWrite(c.env.DB, id);
    if (q.superseded_by) throw bad("This revision has been superseded.");
    await c.env.DB.prepare("UPDATE q_quotes SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return c.json(await loadQuote(c.env.DB, id));
  })

  // ---- revise: REV 01, REV 02 ... same base number ----
  .post("/:id/revise", async (c) => {
    const id = intParam(c.req.param("id"));
    const q = await getForWrite(c.env.DB, id);
    if (q.superseded_by) throw bad("Only the latest revision can be revised.");
    const db = c.env.DB;
    const max = await db.prepare("SELECT MAX(rev) AS r FROM q_quotes WHERE base_number = ?").bind(q.base_number).first<{ r: number }>();
    const newRev = (max?.r ?? 0) + 1;
    const row = await db
      .prepare(
        `INSERT INTO q_quotes (base_number, rev, status, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total)
         SELECT base_number, ?, 'draft', ${HEADER_FIELDS.map((f) => (f === "quote_date" ? "?" : f)).join(", ")}, currency, subtotal, vat_amount, total
         FROM q_quotes WHERE id = ? RETURNING id`,
      )
      .bind(newRev, today(), id)
      .first<{ id: number }>();
    await db.batch([
      db
        .prepare(
          `INSERT INTO q_lines (quote_id, pos, kind, description, qty, unit, rate, amount)
           SELECT ?, pos, kind, description, qty, unit, rate, amount FROM q_lines WHERE quote_id = ?`,
        )
        .bind(row!.id, id),
      db.prepare("UPDATE q_quotes SET superseded_by = ?, updated_at = datetime('now') WHERE id = ?").bind(row!.id, id),
    ]);
    return c.json(await loadQuote(db, row!.id), 201);
  })

  // ---- duplicate as a brand-new quote number ----
  .post("/:id/duplicate", async (c) => {
    const id = intParam(c.req.param("id"));
    await getForWrite(c.env.DB, id);
    const db = c.env.DB;
    const cfg = await getSetting(db, "quotes", { series: "ME" });
    const date = today();
    const number = await nextNumber(db, cfg.series || "ME", date);
    const row = await db
      .prepare(
        `INSERT INTO q_quotes (base_number, rev, status, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total)
         SELECT ?, 0, 'draft', ${HEADER_FIELDS.map((f) => (f === "quote_date" ? "?" : f === "enquiry_ref" ? "NULL" : f)).join(", ")}, currency, subtotal, vat_amount, total
         FROM q_quotes WHERE id = ? RETURNING id`,
      )
      .bind(number, date, id)
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO q_lines (quote_id, pos, kind, description, qty, unit, rate, amount)
         SELECT ?, pos, kind, description, qty, unit, rate, amount FROM q_lines WHERE quote_id = ?`,
      )
      .bind(row!.id, id)
      .run();
    return c.json(await loadQuote(db, row!.id), 201);
  })

  // ---- delete a draft (never-sent) quote ----
  .delete("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const q = await getForWrite(c.env.DB, id);
    if (q.status !== "draft") throw bad("Only drafts can be deleted. Mark it cancelled instead.");
    const db = c.env.DB;
    const { results: files } = await db.prepare("SELECT r2_key FROM files WHERE owner_type = 'quote' AND owner_id = ?").bind(id).all<{ r2_key: string }>();
    if (files.length) await c.env.FILES.delete(files.map((f) => f.r2_key));
    await db.batch([
      db.prepare("DELETE FROM files WHERE owner_type = 'quote' AND owner_id = ?").bind(id),
      db.prepare("DELETE FROM q_lines WHERE quote_id = ?").bind(id),
      db.prepare("DELETE FROM q_emails WHERE quote_id = ?").bind(id),
      // a deleted revision re-opens the one it replaced
      db.prepare("UPDATE q_quotes SET superseded_by = NULL WHERE superseded_by = ?").bind(id),
      db.prepare("DELETE FROM q_quotes WHERE id = ?").bind(id),
    ]);
    return c.json({ ok: true });
  })

  // ---- orders received (won / partly won) ----
  .post("/:id/orders", async (c) => {
    const id = intParam(c.req.param("id"));
    const db = c.env.DB;
    await getOpenForOutcome(db, id);
    const b = await body<Record<string, unknown> & { lines?: OrderLineIn[] }>(c);
    const h = orderHeader(b);
    const lines = await orderLines(db, id, b.lines);
    const subtotal = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
    const row = await db
      .prepare("INSERT INTO q_orders (quote_id, po_number, po_date, note, subtotal) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(id, h.po_number, h.po_date, h.note, subtotal)
      .first<{ id: number }>();
    await db.batch(orderWrites(db, row!.id, lines));
    await refreshOutcome(db, id);
    return c.json({ order_id: row!.id, quote: await loadQuote(db, id) }, 201);
  })
  .put("/:id/orders/:oid", async (c) => {
    const id = intParam(c.req.param("id"));
    const oid = intParam(c.req.param("oid"));
    const db = c.env.DB;
    await getOpenForOutcome(db, id);
    const b = await body<Record<string, unknown> & { lines?: OrderLineIn[] }>(c);
    const h = orderHeader(b);
    const lines = await orderLines(db, id, b.lines);
    const subtotal = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
    const res = await db
      .prepare("UPDATE q_orders SET po_number = ?, po_date = ?, note = ?, subtotal = ?, updated_at = datetime('now') WHERE id = ? AND quote_id = ?")
      .bind(h.po_number, h.po_date, h.note, subtotal, oid, id)
      .run();
    if (!res.meta.changes) throw notFound("Order not found");
    await db.batch(orderWrites(db, oid, lines));
    await refreshOutcome(db, id);
    return c.json({ order_id: oid, quote: await loadQuote(db, id) });
  })
  .delete("/:id/orders/:oid", async (c) => {
    const id = intParam(c.req.param("id"));
    const oid = intParam(c.req.param("oid"));
    const db = c.env.DB;
    const { results: files } = await db.prepare("SELECT r2_key FROM files WHERE owner_type = 'q_order' AND owner_id = ?").bind(oid).all<{ r2_key: string }>();
    if (files.length) await c.env.FILES.delete(files.map((f) => f.r2_key));
    const [, , del] = await db.batch([
      db.prepare("DELETE FROM files WHERE owner_type = 'q_order' AND owner_id = ?").bind(oid),
      db.prepare("DELETE FROM q_order_lines WHERE order_id = ?").bind(oid),
      db.prepare("DELETE FROM q_orders WHERE id = ? AND quote_id = ?").bind(oid, id),
    ]);
    if (!del.meta.changes) throw notFound("Order not found");
    await refreshOutcome(db, id);
    return c.json(await loadQuote(db, id));
  })

  // ---- lost / re-open ----
  .post("/:id/lost", async (c) => {
    const id = intParam(c.req.param("id"));
    const db = c.env.DB;
    await getOpenForOutcome(db, id);
    const n = await db.prepare("SELECT COUNT(*) AS n FROM q_orders WHERE quote_id = ?").bind(id).first<{ n: number }>();
    if (n?.n) throw bad("This quote has orders recorded. Delete them first to mark it lost.");
    const b = await body(c);
    const reason = LOST_REASONS.includes(String(b.reason)) ? String(b.reason) : "Other";
    await db
      .prepare("UPDATE q_quotes SET status = 'lost', lost_reason = ?, lost_note = ?, outcome_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .bind(reason, str(b.note, 2000), id)
      .run();
    return c.json(await loadQuote(db, id));
  })
  .post("/:id/reopen", async (c) => {
    const id = intParam(c.req.param("id"));
    await getOpenForOutcome(c.env.DB, id);
    await refreshOutcome(c.env.DB, id);
    return c.json(await loadQuote(c.env.DB, id));
  })

  // ---- email log ----
  .post("/:id/emails", async (c) => {
    const id = intParam(c.req.param("id"));
    const q = await getForWrite(c.env.DB, id);
    const b = await body(c);
    const db = c.env.DB;
    await db.batch([
      db
        .prepare("INSERT INTO q_emails (quote_id, to_addr, cc_addr, subject, method, sent_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, str(b.to, 500), str(b.cc, 500), str(b.subject, 500), b.method === "outlook" ? "outlook" : "mailto", str(b.sent_by, 200)),
      ...(q.status === "draft" || q.status === "printed"
        ? [db.prepare("UPDATE q_quotes SET status = 'emailed', updated_at = datetime('now') WHERE id = ?").bind(id)]
        : []),
    ]);
    return c.json(await loadQuote(db, id));
  });
