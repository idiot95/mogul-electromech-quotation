export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string; // "local" | "staging" | "production"
}

/** The signed-in user, set by requireUser on every API request. */
export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: "admin" | "user";
  salesmanId: number | null;
  mustChange: boolean;
  sessionId: string;
}

export type AppContext = { Bindings: Env; Variables: { user: SessionUser } };
