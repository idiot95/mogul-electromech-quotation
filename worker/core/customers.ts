import { Hono } from "hono";
import type { AppContext } from "../env";
import { body, bad, intParam, notFound, str } from "./util";

const FIELDS = [
  "name", "address", "contact_person", "email", "phone", "trn",
  "payment_terms", "validity", "delivery_terms", "vat_terms", "notes",
] as const;

function values(b: Record<string, unknown>) {
  return FIELDS.map((f) => str(b[f], f === "address" || f === "notes" ? 2000 : 300));
}

export const customersApi = new Hono<AppContext>()
  .get("/", async (c) => {
    const q = (c.req.query("q") || "").trim();
    const all = c.req.query("all") === "1";
    const where: string[] = [];
    const args: unknown[] = [];
    if (!all) where.push("c.active = 1");
    if (q) {
      where.push("(c.name LIKE ? OR c.email LIKE ? OR c.contact_person LIKE ?)");
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM q_quotes q WHERE q.customer_id = c.id AND q.superseded_by IS NULL) AS quote_count,
         (SELECT MAX(q.quote_date) FROM q_quotes q WHERE q.customer_id = c.id) AS last_quote_date
       FROM customers c ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY c.name COLLATE NOCASE LIMIT 500`,
    )
      .bind(...args)
      .all();
    return c.json(results);
  })
  .get("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const row = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
    if (!row) throw notFound("Customer not found");
    return c.json(row);
  })
  .post("/", async (c) => {
    const b = await body(c);
    if (!str(b.name)) throw bad("Customer name is required");
    const row = await c.env.DB.prepare(
      `INSERT INTO customers (${FIELDS.join(", ")}) VALUES (${FIELDS.map(() => "?").join(", ")}) RETURNING *`,
    )
      .bind(...values(b))
      .first();
    return c.json(row, 201);
  })
  // Bulk import (e.g. from a Tally ledger export). Skips names that already exist.
  .post("/import", async (c) => {
    const b = await body<{ rows: Record<string, unknown>[] }>(c);
    if (!Array.isArray(b.rows)) throw bad("rows[] expected");
    const { results: existing } = await c.env.DB.prepare("SELECT name FROM customers").all<{ name: string }>();
    const seen = new Set(existing.map((r) => r.name.trim().toLowerCase()));
    const stmts: D1PreparedStatement[] = [];
    let skipped = 0;
    for (const r of b.rows.slice(0, 5000)) {
      const name = str(r.name, 300);
      if (!name || seen.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      seen.add(name.toLowerCase());
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO customers (${FIELDS.join(", ")}) VALUES (${FIELDS.map(() => "?").join(", ")})`,
        ).bind(...values({ ...r, name })),
      );
    }
    for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
    return c.json({ imported: stmts.length, skipped });
  })
  .put("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const b = await body(c);
    if (!str(b.name)) throw bad("Customer name is required");
    const row = await c.env.DB.prepare(
      `UPDATE customers SET ${FIELDS.map((f) => `${f} = ?`).join(", ")}, active = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
      .bind(...values(b), b.active === false || b.active === 0 ? 0 : 1, id)
      .first();
    if (!row) throw notFound("Customer not found");
    return c.json(row);
  });
