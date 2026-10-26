import { Hono } from "hono";
import type { AppContext } from "../env";
import { body, bad } from "./util";

const EDITABLE = new Set(["company", "quotes"]);

export async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

export const settingsApi = new Hono<AppContext>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
    const out: Record<string, unknown> = {};
    for (const r of results) out[r.key] = JSON.parse(r.value);
    return c.json(out);
  })
  .put("/:key", async (c) => {
    const key = c.req.param("key");
    if (!EDITABLE.has(key)) throw bad("Unknown setting");
    const value = await body(c);
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
      .bind(key, JSON.stringify(value))
      .run();
    return c.json(value);
  });
