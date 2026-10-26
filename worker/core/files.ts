import { Hono } from "hono";
import type { AppContext } from "../env";
import { bad, intParam, notFound } from "./util";

const MAX_BYTES = 8 * 1024 * 1024;
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
    await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const row = await c.env.DB.prepare(
      `INSERT INTO files (r2_key, name, mime, size, owner_type, owner_id) VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, name, mime, size, created_at`,
    )
      .bind(key, file.name.slice(0, 200), file.type || "application/octet-stream", file.size, ownerType, ownerId)
      .first();
    return c.json(row, 201);
  })
  .get("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const row = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<{ r2_key: string; mime: string; name: string }>();
    if (!row) throw notFound("File not found");
    const obj = await c.env.FILES.get(row.r2_key);
    if (!obj) throw notFound("File missing from storage");
    return new Response(obj.body, {
      headers: {
        "content-type": row.mime,
        "content-disposition": `inline; filename="${row.name.replace(/"/g, "")}"`,
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
