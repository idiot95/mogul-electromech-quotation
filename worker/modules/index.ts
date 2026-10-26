// Module registry. A new module = a folder under modules/ plus one line here.
import type { Hono } from "hono";
import type { AppContext } from "../env";
import { quotesApi } from "./quotes/api";

export interface WorkerModule {
  id: string; // API mounted at /api/<id>; tables prefixed per module
  api: Hono<AppContext>;
}

export const modules: WorkerModule[] = [{ id: "quotes", api: quotesApi as unknown as Hono<AppContext> }];
