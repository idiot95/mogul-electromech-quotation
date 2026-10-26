import { Hono } from "hono";
import type { AppContext } from "./env";
import { HttpError } from "./core/util";
import { settingsApi } from "./core/settings";
import { salesmenApi } from "./core/salesmen";
import { customersApi } from "./core/customers";
import { filesApi } from "./core/files";
import { modules } from "./modules";

const api = new Hono<AppContext>().basePath("/api");

// No sign-in yet (by request). Microsoft sign-in will be added as middleware here.

api.get("/health", (c) => c.json({ ok: true, env: c.env.APP_ENV, modules: modules.map((m) => m.id) }));
api.route("/settings", settingsApi);
api.route("/salesmen", salesmenApi);
api.route("/customers", customersApi);
api.route("/files", filesApi);
for (const m of modules) api.route(`/${m.id}`, m.api);

api.notFound((c) => c.json({ error: "Not found" }, 404));
api.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: "Server error: " + (err as Error).message }, 500);
});

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api.fetch(req, env, ctx);
    // Everything else is the single-page app (served from static assets, SPA fallback in wrangler config).
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<AppContext["Bindings"]>;
