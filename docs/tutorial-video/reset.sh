#!/bin/bash
# Fresh local database + demo data for recording.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
pkill -f "wrangler dev" || true; pkill -f workerd || true; sleep 1
rm -rf .wrangler/state
npm run db:migrate:local >/dev/null 2>&1
(npx wrangler dev --port 8787 > /tmp/wrangler-tutorial.log 2>&1 &)
for i in $(seq 1 40); do curl -sf localhost:8787/api/health >/dev/null && break; sleep 0.5; done
node "$HERE/seed.mjs"
