import { Hono } from "hono";
import type { AppContext } from "../env";
import { body, bad, intParam, notFound, str } from "./util";

const FIELDS = ["name", "email", "phone", "email_template"] as const;

export const salesmenApi = new Hono<AppContext>()
  .get("/", async (c) => {
    const all = c.req.query("all") === "1";
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM salesmen ${all ? "" : "WHERE active = 1"} ORDER BY name COLLATE NOCASE`,
    ).all();
    return c.json(results);
  })
  .post("/", async (c) => {
    const b = await body(c);
    const name = str(b.name, 200);
    if (!name) throw bad("Name is required");
    const row = await c.env.DB.prepare(
      "INSERT INTO salesmen (name, email, phone, email_template) VALUES (?, ?, ?, ?) RETURNING *",
    )
      .bind(name, str(b.email, 200), str(b.phone, 100), str(b.email_template))
      .first();
    return c.json(row, 201);
  })
  .put("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const b = await body(c);
    const name = str(b.name, 200);
    if (!name) throw bad("Name is required");
    const vals = FIELDS.map((f) => str(b[f], f === "email_template" ? 5000 : 200));
    const row = await c.env.DB.prepare(
      `UPDATE salesmen SET ${FIELDS.map((f) => `${f} = ?`).join(", ")}, active = ? WHERE id = ? RETURNING *`,
    )
      .bind(...vals, b.active === false || b.active === 0 ? 0 : 1, id)
      .first();
    if (!row) throw notFound("Salesman not found");
    return c.json(row);
  });
