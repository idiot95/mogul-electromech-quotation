import { Hono } from "hono";
import type { AppContext } from "../env";
import { bad, intParam, notFound } from "./util";

const MAX_BYTES = 8 * 1024 * 1024;
// Only these are shown in the browser. Anything else (HTML, SVG, scripts...) is served as a download, because a file
// shown from the app's own origin could otherwise run script with the app's authority.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);
const OWNER_TYPES = new Set(["quote", "q_order"]); // q_order = customer PO copies

export const filesApi = new Hono<AppContext>()
  .get("/", async (c) => {
    const ownerType = c.req.query("owner_type") || "";
    const ownerId = Number(c.req.query("owner_id"));
    if (!OWNER_TYPES.has(ownerType) || !ownerId) throw bad("owner_type and owner_id required");
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
    const row = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<{ r2_key: string; mime: string; name: string }>();
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
    const row = await c.env.DB.prepare("DELETE FROM files WHERE id = ? RETURNING r2_key").bind(id).first<{ r2_key: string }>();
    if (!row) throw notFound("File not found");
    await c.env.FILES.delete(row.r2_key);
    return c.json({ ok: true });
  });
