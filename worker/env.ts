export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string; // "local" | "staging" | "production"
}

export type AppContext = { Bindings: Env };
