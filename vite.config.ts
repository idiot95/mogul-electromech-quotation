import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA is built to dist/ and served by the Worker as static assets.
// In dev, API calls are proxied to `wrangler dev` on :8787.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  test: { root: ".", environment: "jsdom", include: ["test/**/*.test.ts"] },
} as any);
