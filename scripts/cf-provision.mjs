// Make sure the D1 database and R2 bucket for an environment exist, then write the D1 id into wrangler.jsonc.
// Both are created in Western Europe (Amsterdam): the closest D1 / R2 region to the UAE. A location can't be changed later.
// Usage: node scripts/cf-provision.mjs staging|production   (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const env = process.argv[2];
if (!["staging", "production"].includes(env)) throw new Error("env must be staging or production");
const LOCATION = "weur";
// staging moved to Western Europe in Oct 2026 under a new name (the first staging DB was created in Eastern North America)
const name = env === "staging" ? "mogul-workspace-staging-eu" : "mogul-workspace-production";
const dbName = name;
const bucket = name;
const wr = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

let dbs = JSON.parse(wr("d1", "list", "--json"));
let db = dbs.find((d) => d.name === dbName);
if (!db) {
  console.log(`Creating D1 database ${dbName}`);
  wr("d1", "create", dbName, "--location", LOCATION);
  dbs = JSON.parse(wr("d1", "list", "--json"));
  db = dbs.find((d) => d.name === dbName);
}
const buckets = wr("r2", "bucket", "list");
if (!buckets.includes(bucket)) {
  console.log(`Creating R2 bucket ${bucket}`);
  wr("r2", "bucket", "create", bucket, "--location", LOCATION);
}
const file = "wrangler.jsonc";
const key = env === "staging" ? "REPLACE_STAGING_D1_ID" : "REPLACE_PRODUCTION_D1_ID";
writeFileSync(file, readFileSync(file, "utf8").replace(key, db.uuid));
console.log(`${env}: D1 ${db.uuid}, R2 ${bucket}`);
