import { Hono } from "hono";
import type { AppContext } from "../env";
import { bad, intParam, notFound } from "./util";
import { ownQuote } from "./auth";
import type { SessionUser } from "../env";

const MAX_BYTES = 8 * 1024 * 1024;
// Only these are shown in the browser. Anything else (HTML, SVG, scripts...) is served as a download, because a file
// shown from the app's own origin could otherwise run script with the app's authority.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);
const OWNER_TYPES = new Set(["quote", "q_order"]); // q_order = customer PO copies

/** The quotation a file belongs to (directly, or through a PO), as SQL over a files row aliased f. */
const QUOTE_OF_FILE = `(CASE f.owner_type WHEN 'quote' THEN f.owner_id ELSE (SELECT o.quote_id FROM q_orders o WHERE o.id = f.owner_id) END)`;

/** Throws "not found" unless the user may see the quotation that owns these files. */
async function checkOwner(db: D1Database, user: SessionUser, type: string, id: number) {
  const own = ownQuote(user, "q.created_by");
  const quoteId = type === "quote" ? "?" : "(SELECT o.quote_id FROM q_orders o WHERE o.id = ?)";
  const ok = await db.prepare(`SELECT 1 FROM q_quotes q WHERE q.id = ${quoteId} AND ${own.sql}`).bind(id, ...own.args).first();
  if (!ok) throw notFound("Not found");
}

/** A file row, if the user may see the quotation it belongs to. */
function visibleFile(db: D1Database, user: SessionUser, id: number) {
  const own = ownQuote(user, "q.created_by");
  return db
    .prepare(`SELECT f.* FROM files f JOIN q_quotes q ON q.id = ${QUOTE_OF_FILE} WHERE f.id = ? AND ${own.sql}`)
    .bind(id, ...own.args)
    .first<{ r2_key: string; mime: string; name: string }>();
}

export const filesApi = new Hono<AppContext>()
  .get("/", async (c) => {
    const ownerType = c.req.query("owner_type") || "";
    const ownerId = Number(c.req.query("owner_id"));
    if (!OWNER_TYPES.has(ownerType) || !ownerId) throw bad("owner_type and owner_id required");
    await checkOwner(c.env.DB, c.get("user"), ownerType, ownerId);
    const { results } = await c.env.DB.prepare(
      "SELECT id, name, mime, size, created_at FROM files WHERE owner_type = ? AND owner_id = ? ORDER BY id",
    )
      .bind(ownerType, ownerId)
      .all();
    return c.json(results);
  })
  .post("/", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    const ownerType = String(form.get("owner_type") || "");
    const ownerId = Number(form.get("owner_id"));
    if (!(file instanceof File)) throw bad("file required");
    if (!OWNER_TYPES.has(ownerType) || !ownerId) throw bad("owner_type and owner_id required");
    if (file.size > MAX_BYTES) throw bad("File too large (max 8 MB)");
    await checkOwner(c.env.DB, c.get("user"), ownerType, ownerId);
    const key = `${ownerType}/${ownerId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
    // store the file and record it at the same time; if storing fails, drop the record again
    const [stored, row] = await Promise.allSettled([
      c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } }),
      c.env.DB.prepare(
        `INSERT INTO files (r2_key, name, mime, size, owner_type, owner_id) VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, name, mime, size, created_at`,
      )
        .bind(key, file.name.slice(0, 200), file.type || "application/octet-stream", file.size, ownerType, ownerId)
        .first(),
    ]);
    if (stored.status === "rejected" || row.status === "rejected") {
      await Promise.allSettled([c.env.FILES.delete(key), c.env.DB.prepare("DELETE FROM files WHERE r2_key = ?").bind(key).run()]);
      throw (stored.status === "rejected" ? stored.reason : (row as PromiseRejectedResult).reason) as Error;
    }
    return c.json(row.value, 201);
  })
  .get("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const row = await visibleFile(c.env.DB, c.get("user"), id);
    if (!row) throw notFound("File not found");
    const obj = await c.env.FILES.get(row.r2_key);
    if (!obj) throw notFound("File missing from storage");
    const inline = INLINE_TYPES.has(row.mime);
    const name = row.name.replace(/[^\w .()\-]+/g, "_");
    return new Response(obj.body, {
      headers: {
        "content-type": inline ? row.mime : "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
        "x-content-type-options": "nosniff",
        // a sandboxed, script-free document; PDFs are left out because the browser's PDF viewer needs plugins
        ...(row.mime === "application/pdf" ? {} : { "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
        "cache-control": "private, max-age=86400",
      },
    });
  })
  .delete("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!(await visibleFile(c.env.DB, c.get("user"), id))) throw notFound("File not found");
    const row = await c.env.DB.prepare("DELETE FROM files WHERE id = ? RETURNING r2_key").bind(id).first<{ r2_key: string }>();
    if (!row) throw notFound("File not found");
    await c.env.FILES.delete(row.r2_key);
    return c.json({ ok: true });
  });
