import type { Context } from "hono";
import type { AppContext } from "../env";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (what = "Not found") => new HttpError(404, what);

export async function body<T = Record<string, unknown>>(c: Context<AppContext>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw bad("Invalid JSON body");
  }
}

export function str(v: unknown, max = 5000): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, max);
}

export function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function intParam(v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad("Invalid id");
  return n;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
