import { Hono } from "hono";
import type { AppContext } from "../../env";
import { body, bad, intParam, notFound, num, round2, str } from "../../core/util";
import { getSetting } from "../../core/settings";
import { nextNumber } from "../../core/numbering";

export const STATUSES = ["draft", "printed", "emailed", "cancelled"] as const;

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

function lineInserts(db: D1Database, quoteId: number, lines: ReturnType<typeof cleanLines>) {
  return lines.map((l, i) =>
    db
      .prepare("INSERT INTO q_lines (quote_id, pos, kind, description, qty, unit, rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(quoteId, i + 1, l.kind, l.description, l.qty, l.unit, l.rate, l.amount),
  );
}

async function loadQuote(db: D1Database, id: number) {
  const q = await db
    .prepare(
      `SELECT q.*, s.name AS salesman_name, s.email AS salesman_email, s.phone AS salesman_phone,
              s.email_template AS salesman_email_template, c.email AS customer_email
       FROM q_quotes q
       LEFT JOIN salesmen s ON s.id = q.salesman_id
       LEFT JOIN customers c ON c.id = q.customer_id
       WHERE q.id = ?`,
    )
    .bind(id)
    .first<QuoteRow>();
  if (!q) throw notFound("Quote not found");
  const [lines, emails, revisions, files] = await db.batch([
    db.prepare("SELECT * FROM q_lines WHERE quote_id = ? ORDER BY pos").bind(id),
    db.prepare("SELECT * FROM q_emails WHERE quote_id = ? ORDER BY id DESC").bind(id),
    db.prepare("SELECT id, rev, status, quote_date, total FROM q_quotes WHERE base_number = ? ORDER BY rev").bind(q.base_number),
    db.prepare("SELECT COUNT(*) AS n FROM files WHERE owner_type = 'quote' AND owner_id = ?").bind(id),
  ]);
  return {
    ...q,
    lines: lines.results,
    emails: emails.results,
    revisions: revisions.results,
    workings_count: (files.results[0] as { n: number }).n,
  };
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
    if (STATUSES.includes(status as never)) {
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
              (SELECT COUNT(*) FROM q_lines l WHERE l.quote_id = q.id AND l.kind = 'item') AS line_count
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
    const [kpi, byCustomer, largest, byStatus, bySalesman] = await db.batch([
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
        `SELECT COALESCE(s.name, '—') AS name, COUNT(*) AS quotes, SUM(q.subtotal) AS amount
         FROM q_quotes q LEFT JOIN salesmen s ON s.id = q.salesman_id
         WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ?
         GROUP BY s.name ORDER BY amount DESC`,
      ).bind(since),
    ]);
    return c.json({
      since,
      days,
      kpi: kpi.results[0],
      byCustomer: byCustomer.results,
      largest: largest.results,
      byStatus: byStatus.results,
      bySalesman: bySalesman.results,
    });
  })

  .get("/:id", async (c) => c.json(await loadQuote(c.env.DB, intParam(c.req.param("id")))))

  // ---- create ----
  .post("/", async (c) => {
    const b = await body<QuoteIn>(c);
    const cfg = await getSetting(c.env.DB, "quotes", { series: "ME", vatRate: 5, currency: "AED" });
    const h = header(b, cfg);
    const lines = cleanLines(b.lines);
    const t = totals(lines, h.vat_rate);
    const number = await nextNumber(c.env.DB, cfg.series || "ME", h.quote_date);
    const row = await c.env.DB.prepare(
      `INSERT INTO q_quotes (base_number, rev, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total)
       VALUES (?, 0, ${HEADER_FIELDS.map(() => "?").join(", ")}, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(number, ...HEADER_FIELDS.map((f) => h[f]), cfg.currency || "AED", t.subtotal, t.vat_amount, t.total)
      .first<{ id: number }>();
    const stmts = lineInserts(c.env.DB, row!.id, lines);
    if (stmts.length) await c.env.DB.batch(stmts);
    return c.json(await loadQuote(c.env.DB, row!.id), 201);
  })

  // ---- update (header + full line list, saved in one batch) ----
  .put("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const existing = await getForWrite(c.env.DB, id);
    if (existing.superseded_by) throw bad("This revision has been superseded and is read-only. Open the latest revision.");
    const b = await body<QuoteIn>(c);
    const cfg = await getSetting(c.env.DB, "quotes", { vatRate: 5 });
    const h = header(b, cfg);
    const lines = cleanLines(b.lines);
    const t = totals(lines, h.vat_rate);
    const db = c.env.DB;
    await db.batch([
      db
        .prepare(
          `UPDATE q_quotes SET ${HEADER_FIELDS.map((f) => `${f} = ?`).join(", ")},
             subtotal = ?, vat_amount = ?, total = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(...HEADER_FIELDS.map((f) => h[f]), t.subtotal, t.vat_amount, t.total, id),
      db.prepare("DELETE FROM q_lines WHERE quote_id = ?").bind(id),
      ...lineInserts(db, id, lines),
    ]);
    return c.json(await loadQuote(db, id));
  })

  // ---- status ----
  .post("/:id/status", async (c) => {
    const id = intParam(c.req.param("id"));
    const { status } = await body<{ status: string }>(c);
    if (!STATUSES.includes(status as never)) throw bad("Invalid status");
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
      ...(q.status !== "cancelled"
        ? [db.prepare("UPDATE q_quotes SET status = 'emailed', updated_at = datetime('now') WHERE id = ?").bind(id)]
        : []),
    ]);
    return c.json(await loadQuote(db, id));
  });
