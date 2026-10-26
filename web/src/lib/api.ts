export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (data instanceof FormData) init.body = data;
  else if (data !== undefined) {
    init.body = JSON.stringify(data);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await fetch("/api" + path, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string })?.error || `${res.status} ${res.statusText}`);
  return json as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, d?: unknown) => request<T>("POST", p, d ?? {}),
  put: <T>(p: string, d: unknown) => request<T>("PUT", p, d),
  del: <T>(p: string) => request<T>("DELETE", p),
};

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? "?" + s : "";
}
