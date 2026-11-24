import { Hono } from "hono";
import type { AppContext, SessionUser } from "../../env";
import { ownQuote } from "../../core/auth";
import { body, bad, HttpError, intParam, notFound, num, round2, str } from "../../core/util";
import { getSetting } from "../../core/settings";
import { nextNumber } from "../../core/numbering";

export const STATUSES = ["draft", "printed", "emailed", "won", "partly_won", "lost", "cancelled"] as const;
/** Statuses that can be set directly; won / partly won follow from the orders recorded, lost goes through /lost. */
const MANUAL_STATUSES = ["draft", "printed", "emailed", "cancelled"];
const LOST_REASONS = ["Price", "Delivery time", "No response", "Went to competitor", "Brand / spec", "Enquiry cancelled", "Other"];

const HEADER_FIELDS = [
  "quote_date", "customer_id", "customer_name", "customer_address", "attention", "enquiry_ref",
  "sales_rep_id", "payment_terms", "validity", "delivery_terms", "vat_terms", "vat_rate",
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
  approval_status: "none" | "pending" | "approved" | "returned";
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
    sales_rep_id: num(b.sales_rep_id),
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
function loadStatements(db: D1Database, idSql: string, args: unknown[], user: SessionUser) {
  const q = (sql: string, n: number) => db.prepare(sql.replaceAll("$ID", idSql)).bind(...Array.from({ length: n }, () => args).flat());
  const own = ownQuote(user, "q.created_by");
  return [
    // a quotation the user may not see comes back empty, and assemble() answers "not found"
    db
      .prepare(
        `SELECT q.*, r.display_name AS sales_rep_name, r.email AS sales_rep_email, r.phone AS sales_rep_phone,
                r.email_template AS sales_rep_email_template, c.email AS customer_email, cb.display_name AS created_by_name
         FROM q_quotes q
         LEFT JOIN users r ON r.id = q.sales_rep_id
         LEFT JOIN users cb ON cb.id = q.created_by
         LEFT JOIN customers c ON c.id = q.customer_id
         WHERE q.id = ${idSql} AND ${own.sql}`,
      )
      .bind(...args, ...own.args),
    q("SELECT * FROM q_lines WHERE quote_id = $ID ORDER BY pos", 1),
    q("SELECT * FROM q_emails WHERE quote_id = $ID ORDER BY id DESC", 1),
    q("SELECT id, rev, status, quote_date, total FROM q_quotes WHERE base_number = (SELECT base_number FROM q_quotes WHERE id = $ID) ORDER BY rev", 1),
    q("SELECT * FROM q_orders WHERE quote_id = $ID ORDER BY COALESCE(po_date, created_at), id", 1),
    q("SELECT ol.* FROM q_order_lines ol JOIN q_orders o ON o.id = ol.order_id WHERE o.quote_id = $ID ORDER BY ol.order_id, ol.pos", 1),
    q("SELECT f.id, f.name, f.mime, f.size, f.created_at, f.owner_id FROM files f JOIN q_orders o ON o.id = f.owner_id WHERE f.owner_type = 'q_order' AND o.quote_id = $ID", 1),
    q("SELECT a.id, a.action, a.note, a.created_at, u.display_name AS user_name FROM q_approval_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.quote_id = $ID ORDER BY a.id", 1),
  ];
}
const LOAD_COUNT = 8;

/** Builds the quote from the results of loadStatements (the last LOAD_COUNT results of a batch). */
function assemble(results: D1Result[]) {
  const [quote, lines, emails, revisions, orders, orderLines, poFiles, approvals] = results.slice(-LOAD_COUNT);
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
    approvals: approvals.results,
  };
}

async function loadQuote(db: D1Database, id: number, user: SessionUser) {
  return assemble(await db.batch(loadStatements(db, "?", [id], user)));
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

async function getOpenForOutcome(db: D1Database, id: number, user: SessionUser) {
  const q = await getForWrite(db, id, user);
  if (q.superseded_by) throw bad("Record orders on the latest revision.");
  if (q.status === "cancelled") throw bad("Re-open the cancelled quote first.");
  return q;
}

const APPROVAL: Record<string, { from: string[]; to: string; log: string; admin: boolean; wrongState: string }> = {
  submit: { from: ["none", "returned"], to: "pending", log: "submitted", admin: false, wrongState: "This quotation is already waiting for approval or approved." },
  withdraw: { from: ["pending"], to: "none", log: "withdrawn", admin: false, wrongState: "This quotation isn't waiting for approval." },
  approve: { from: ["pending"], to: "approved", log: "approved", admin: true, wrongState: "Only a quotation waiting for approval can be approved." },
  return: { from: ["pending"], to: "returned", log: "returned", admin: true, wrongState: "Only a quotation waiting for approval can be returned." },
};

/** With "require approval" switched on in Settings, a quotation must be approved before it is printed or emailed. */
async function checkApproved(db: D1Database, q: QuoteRow, what: string) {
  if (q.approval_status === "approved") return;
  const cfg = await getSetting(db, "quotes", { requireApproval: false });
  if (cfg.requireApproval) throw bad(`This quotation needs approval before it is ${what}.`);
}

/** The quotation, if the user may see it (their own, or any for an admin). */
async function getForWrite(db: D1Database, id: number, user: SessionUser) {
  const own = ownQuote(user);
  const q = await db.prepare(`SELECT * FROM q_quotes WHERE id = ? AND ${own.sql}`).bind(id, ...own.args).first<QuoteRow>();
  if (!q) throw notFound("Quote not found");
  return q;
}

export const quotesApi = new Hono<AppContext>()
  // ---- list & search ----
  .get("/", async (c) => {
    const q = (c.req.query("q") || "").trim();
    const status = c.req.query("status") || "";
    const customerId = Number(c.req.query("customer_id")) || 0;
    const salesRepId = Number(c.req.query("sales_rep_id")) || 0;
    const from = c.req.query("from") || "";
    const to = c.req.query("to") || "";
    const allRevs = c.req.query("all_revisions") === "1";
    const limit = Math.min(Number(c.req.query("limit")) || 200, 1000);
    const own = ownQuote(c.get("user"), "q.created_by");
    const where: string[] = [own.sql];
    const args: unknown[] = [...own.args];
    if (!allRevs) where.push("q.superseded_by IS NULL");
    if (q) {
      where.push(
        `(q.base_number LIKE ? OR q.customer_name LIKE ? OR q.enquiry_ref LIKE ?
          OR EXISTS (SELECT 1 FROM q_lines l WHERE l.quote_id = q.id AND l.description LIKE ?))`,
      );
      args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const approval = c.req.query("approval") || "";
    if (["pending", "approved", "returned"].includes(approval)) {
      where.push("q.approval_status = ?");
      args.push(approval);
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
    if (salesRepId) {
      where.push("q.sales_rep_id = ?");
      args.push(salesRepId);
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
              q.sales_rep_id, r.display_name AS sales_rep_name, q.subtotal, q.total, q.currency, q.superseded_by, q.updated_at,
              (SELECT COUNT(*) FROM q_lines l WHERE l.quote_id = q.id AND l.kind = 'item') AS line_count,
              (SELECT COALESCE(SUM(o.subtotal), 0) FROM q_orders o WHERE o.quote_id = q.id) AS ordered_value,
              q.lost_reason, u.display_name AS created_by_name, q.approval_status
       FROM q_quotes q LEFT JOIN users r ON r.id = q.sales_rep_id LEFT JOIN users u ON u.id = q.created_by
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
    const own = ownQuote(c.get("user"), "q.created_by"); // users see the figures for their own quotations
    const base = `FROM q_quotes q WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ? AND ${own.sql}`;
    const db = c.env.DB;
    const [kpi, byCustomer, largest, byStatus, byRep, received, followUp, lostWhy, approvals] = await db.batch([
      db.prepare(`SELECT COUNT(*) AS quotes, COALESCE(SUM(q.subtotal),0) AS amount, COUNT(DISTINCT q.customer_name) AS customers ${base}`).bind(since, ...own.args),
      db.prepare(`SELECT q.customer_name AS name, SUM(q.subtotal) AS amount, COUNT(*) AS quotes ${base} GROUP BY q.customer_name ORDER BY amount DESC LIMIT 8`).bind(since, ...own.args),
      db.prepare(
        `SELECT q.id, q.base_number, q.rev, q.customer_name, q.subtotal, q.status, r.display_name AS sales_rep_name
         FROM q_quotes q LEFT JOIN users r ON r.id = q.sales_rep_id
         WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ? AND ${own.sql}
         ORDER BY q.subtotal DESC LIMIT 6`,
      ).bind(since, ...own.args),
      db.prepare(`SELECT q.status, COUNT(*) AS quotes, SUM(q.subtotal) AS amount ${base} GROUP BY q.status`).bind(since, ...own.args),
      db.prepare(
        `SELECT COALESCE(r.display_name, 'Unassigned') AS name, COUNT(*) AS quotes, SUM(q.subtotal) AS amount
         FROM q_quotes q LEFT JOIN users r ON r.id = q.sales_rep_id
         WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.quote_date >= ? AND ${own.sql}
         GROUP BY r.display_name ORDER BY amount DESC`,
      ).bind(since, ...own.args),
      // orders received in the period, whenever the quote was made
      db.prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(o.subtotal), 0) AS amount FROM q_orders o JOIN q_quotes q ON q.id = o.quote_id
         WHERE COALESCE(o.po_date, substr(o.created_at, 1, 10)) >= ? AND ${own.sql}`,
      ).bind(since, ...own.args),
      // sent more than a week ago, no answer yet
      db.prepare(
        `SELECT q.id, q.base_number, q.rev, q.quote_date, q.customer_name, q.subtotal, q.status, r.display_name AS sales_rep_name
         FROM q_quotes q LEFT JOIN users r ON r.id = q.sales_rep_id
         WHERE q.superseded_by IS NULL AND q.status IN ('printed', 'emailed') AND q.quote_date <= date(?, '-7 days') AND q.quote_date >= date(?, '-120 days') AND ${own.sql}
         ORDER BY q.subtotal DESC LIMIT 8`,
      ).bind(today(), today(), ...own.args),
      db.prepare(`SELECT COALESCE(q.lost_reason, 'Other') AS name, COUNT(*) AS quotes, SUM(q.subtotal) AS amount ${base} AND q.status = 'lost' GROUP BY 1 ORDER BY amount DESC`).bind(since, ...own.args),
      // waiting for an admin / sent back to the rep, whatever the period
      db.prepare(
        `SELECT q.approval_status, COUNT(*) AS n FROM q_quotes q
         WHERE q.superseded_by IS NULL AND q.status != 'cancelled' AND q.approval_status IN ('pending', 'returned') AND ${own.sql}
         GROUP BY q.approval_status`,
      ).bind(...own.args),
    ]);
    return c.json({
      since,
      days,
      kpi: kpi.results[0],
      byCustomer: byCustomer.results,
      largest: largest.results,
      byStatus: byStatus.results,
      byRep: byRep.results,
      received: received.results[0],
      followUp: followUp.results,
      lostWhy: lostWhy.results,
      approvals: Object.fromEntries((approvals.results as { approval_status: string; n: number }[]).map((r) => [r.approval_status, r.n])),
    });
  })

  .get("/:id", async (c) => c.json(await loadQuote(c.env.DB, intParam(c.req.param("id")), c.get("user"))))

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
          `INSERT INTO q_quotes (base_number, rev, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total, created_by)
           SELECT printf('%s-%02d-%03d', ns.series, ns.year, ns.last), 0, ${HEADER_FIELDS.map(() => "?").join(", ")}, ${cfg("currency", "AED")}, ?, ?, ?, ?
           FROM number_series ns WHERE ns.series = ${series} AND ns.year = ?`,
        )
        .bind(...HEADER_FIELDS.map((f) => h[f]), t.subtotal, t.vat_amount, t.total, c.get("user").id, yy),
      ...lineInserts(db, newId, [], lines),
      ...loadStatements(db, newId, [], c.get("user")),
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
    const own = ownQuote(c.get("user"));
    // not while it waits for approval: what the admin approves is what goes out
    const editable = `EXISTS (SELECT 1 FROM q_quotes WHERE id = ? AND superseded_by IS NULL AND approval_status != 'pending' AND ${own.sql})`;
    const res = await db.batch([
      // an approved quotation that is changed needs approval again
      db
        .prepare(`INSERT INTO q_approval_log (quote_id, action, user_id, note) SELECT ?, 'reset', ?, 'Changed after approval' WHERE ${editable.replace("approval_status != 'pending'", "approval_status = 'approved'")}`)
        .bind(id, c.get("user").id, id, ...own.args),
      db
        .prepare(
          `UPDATE q_quotes SET ${HEADER_FIELDS.map((f) => `${f} = ?`).join(", ")},
             subtotal = ?, vat_amount = ?, total = ?, updated_at = datetime('now'),
             approval_status = CASE approval_status WHEN 'approved' THEN 'none' ELSE approval_status END
           WHERE id = ? AND superseded_by IS NULL AND approval_status != 'pending' AND ${own.sql}`,
        )
        .bind(...HEADER_FIELDS.map((f) => h[f]), t.subtotal, t.vat_amount, t.total, id, ...own.args),
      db.prepare(`DELETE FROM q_lines WHERE quote_id = ? AND ${editable}`).bind(id, id, ...own.args),
      ...lineInserts(db, "?", [id], lines, editable, [id, ...own.args]),
      ...loadStatements(db, "?", [id], c.get("user")),
    ]);
    const q = assemble(res);
    if (!res[1].meta.changes && q.superseded_by) throw bad("This revision has been superseded and is read-only. Open the latest revision.");
    if (!res[1].meta.changes && q.approval_status === "pending") throw bad("This quotation is waiting for approval. Withdraw it to make changes.");
    return c.json(q);
  })

  // ---- status ----
  .post("/:id/status", async (c) => {
    const id = intParam(c.req.param("id"));
    const { status } = await body<{ status: string }>(c);
    if (!MANUAL_STATUSES.includes(status)) throw bad("Invalid status");
    const q = await getForWrite(c.env.DB, id, c.get("user"));
    if (q.superseded_by) throw bad("This revision has been superseded.");
    if (status === "printed") await checkApproved(c.env.DB, q, "printed");
    await c.env.DB.prepare("UPDATE q_quotes SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return c.json(await loadQuote(c.env.DB, id, c.get("user")));
  })

  // ---- revise: REV 01, REV 02 ... same base number ----
  .post("/:id/revise", async (c) => {
    const id = intParam(c.req.param("id"));
    const q = await getForWrite(c.env.DB, id, c.get("user"));
    if (q.superseded_by) throw bad("Only the latest revision can be revised.");
    const db = c.env.DB;
    const max = await db.prepare("SELECT MAX(rev) AS r FROM q_quotes WHERE base_number = ?").bind(q.base_number).first<{ r: number }>();
    const newRev = (max?.r ?? 0) + 1;
    const row = await db
      .prepare(
        // a revision stays with whoever created the quotation, so they keep seeing it
        `INSERT INTO q_quotes (base_number, rev, status, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total, created_by)
         SELECT base_number, ?, 'draft', ${HEADER_FIELDS.map((f) => (f === "quote_date" ? "?" : f)).join(", ")}, currency, subtotal, vat_amount, total, created_by
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
    return c.json(await loadQuote(db, row!.id, c.get("user")), 201);
  })

  // ---- duplicate as a brand-new quote number ----
  .post("/:id/duplicate", async (c) => {
    const id = intParam(c.req.param("id"));
    await getForWrite(c.env.DB, id, c.get("user"));
    const db = c.env.DB;
    const cfg = await getSetting(db, "quotes", { series: "ME" });
    const date = today();
    const number = await nextNumber(db, cfg.series || "ME", date);
    const row = await db
      .prepare(
        `INSERT INTO q_quotes (base_number, rev, status, ${HEADER_FIELDS.join(", ")}, currency, subtotal, vat_amount, total, created_by)
         SELECT ?, 0, 'draft', ${HEADER_FIELDS.map((f) => (f === "quote_date" ? "?" : f === "enquiry_ref" ? "NULL" : f)).join(", ")}, currency, subtotal, vat_amount, total, ?
         FROM q_quotes WHERE id = ? RETURNING id`,
      )
      .bind(number, date, c.get("user").id, id)
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO q_lines (quote_id, pos, kind, description, qty, unit, rate, amount)
         SELECT ?, pos, kind, description, qty, unit, rate, amount FROM q_lines WHERE quote_id = ?`,
      )
      .bind(row!.id, id)
      .run();
    return c.json(await loadQuote(db, row!.id, c.get("user")), 201);
  })

  // ---- delete a draft (never-sent) quote ----
  .delete("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const q = await getForWrite(c.env.DB, id, c.get("user"));
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
    await getOpenForOutcome(db, id, c.get("user"));
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
    return c.json({ order_id: row!.id, quote: await loadQuote(db, id, c.get("user")) }, 201);
  })
  .put("/:id/orders/:oid", async (c) => {
    const id = intParam(c.req.param("id"));
    const oid = intParam(c.req.param("oid"));
    const db = c.env.DB;
    await getOpenForOutcome(db, id, c.get("user"));
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
    return c.json({ order_id: oid, quote: await loadQuote(db, id, c.get("user")) });
  })
  .delete("/:id/orders/:oid", async (c) => {
    const id = intParam(c.req.param("id"));
    const oid = intParam(c.req.param("oid"));
    const db = c.env.DB;
    await getForWrite(db, id, c.get("user"));
    const { results: files } = await db.prepare("SELECT r2_key FROM files WHERE owner_type = 'q_order' AND owner_id = ?").bind(oid).all<{ r2_key: string }>();
    if (files.length) await c.env.FILES.delete(files.map((f) => f.r2_key));
    const [, , del] = await db.batch([
      db.prepare("DELETE FROM files WHERE owner_type = 'q_order' AND owner_id = ?").bind(oid),
      db.prepare("DELETE FROM q_order_lines WHERE order_id = ?").bind(oid),
      db.prepare("DELETE FROM q_orders WHERE id = ? AND quote_id = ?").bind(oid, id),
    ]);
    if (!del.meta.changes) throw notFound("Order not found");
    await refreshOutcome(db, id);
    return c.json(await loadQuote(db, id, c.get("user")));
  })

  // ---- lost / re-open ----
  .post("/:id/lost", async (c) => {
    const id = intParam(c.req.param("id"));
    const db = c.env.DB;
    await getOpenForOutcome(db, id, c.get("user"));
    const n = await db.prepare("SELECT COUNT(*) AS n FROM q_orders WHERE quote_id = ?").bind(id).first<{ n: number }>();
    if (n?.n) throw bad("This quote has orders recorded. Delete them first to mark it lost.");
    const b = await body(c);
    const reason = LOST_REASONS.includes(String(b.reason)) ? String(b.reason) : "Other";
    await db
      .prepare("UPDATE q_quotes SET status = 'lost', lost_reason = ?, lost_note = ?, outcome_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .bind(reason, str(b.note, 2000), id)
      .run();
    return c.json(await loadQuote(db, id, c.get("user")));
  })
  .post("/:id/reopen", async (c) => {
    const id = intParam(c.req.param("id"));
    await getOpenForOutcome(c.env.DB, id, c.get("user"));
    await refreshOutcome(c.env.DB, id);
    return c.json(await loadQuote(c.env.DB, id, c.get("user")));
  })

  // ---- approval by an admin ----
  .post("/:id/approval", async (c) => {
    const id = intParam(c.req.param("id"));
    const user = c.get("user");
    const db = c.env.DB;
    const q = await getForWrite(db, id, user);
    const b = await body(c);
    const action = String(b.action);
    const note = str(b.note, 2000);
    const rule = APPROVAL[action];
    if (!rule) throw bad("Unknown approval action");
    if (rule.admin && user.role !== "admin") throw new HttpError(403, "Only an admin can approve or return a quotation.");
    if (q.superseded_by) throw bad("This revision has been superseded.");
    if (q.status === "cancelled") throw bad("Re-open the cancelled quotation first.");
    if (!rule.from.includes(String(q.approval_status))) throw bad(rule.wrongState);
    if (action === "return" && !note) throw bad("Say what needs to change.");
    if (action === "submit") {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM q_lines WHERE quote_id = ? AND kind = 'item'").bind(id).first<{ n: number }>();
      if (!n?.n) throw bad("Add at least one line before sending for approval.");
    }
    const res = await db.batch([
      // only if nobody changed it in the meantime
      db
        .prepare(
          `UPDATE q_quotes SET approval_status = ?, approval_at = datetime('now'), approval_by = ?
           WHERE id = ? AND approval_status IN (${rule.from.map(() => "?").join(", ")})`,
        )
        .bind(rule.to, user.id, id, ...rule.from),
      db
        .prepare(`INSERT INTO q_approval_log (quote_id, action, user_id, note) SELECT ?, ?, ?, ? WHERE changes() > 0`)
        .bind(id, rule.log, user.id, note),
      ...loadStatements(db, "?", [id], user),
    ]);
    if (!res[0].meta.changes) throw new HttpError(409, "Someone else changed this quotation's approval just now. Reload to see it.");
    return c.json(assemble(res));
  })

  // ---- email log ----
  .post("/:id/emails", async (c) => {
    const id = intParam(c.req.param("id"));
    const q = await getForWrite(c.env.DB, id, c.get("user"));
    await checkApproved(c.env.DB, q, "emailed");
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
    return c.json(await loadQuote(db, id, c.get("user")));
  });
