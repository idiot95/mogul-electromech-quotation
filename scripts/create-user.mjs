// Create a user from the command line: the first admin of a new environment, or a recovery admin.
// Usage: node scripts/create-user.mjs local|staging|production <username> "<Full Name>" [--admin]
// Prints a temporary password once; it must be changed at first sign-in. Only the hash is stored.
// (For local, run it with the dev database: it uses `wrangler d1 execute --local`.)
import { execFileSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";

const [env, username, name, flag] = process.argv.slice(2);
if (!["local", "staging", "production"].includes(env) || !username || !name) {
  console.error('Usage: node scripts/create-user.mjs local|staging|production <username> "<Full Name>" [--admin]');
  process.exit(1);
}
if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("username: 3–40 of a-z 0-9 . _ -");

// same format as worker/core/auth.ts
const ITERATIONS = 100_000;
const b64 = (b) => Buffer.from(b).toString("base64");
const salt = crypto.getRandomValues(new Uint8Array(16));
const words = "amber,basil,cedar,delta,ember,flint,grove,harbor,indigo,jasper,kestrel,lumen,maple,nectar,onyx,pepper,quartz,river,saffron,tundra".split(",");
const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
const password = `${pick()}-${pick()}-${crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000}`;
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
const stored = `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql =
  `INSERT INTO users (username, display_name, password_hash, role, must_change_password) VALUES (${q(username)}, ${q(name)}, ${q(stored)}, ${q(flag === "--admin" ? "admin" : "user")}, 1) ` +
  `ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, must_change_password = 1, failed_logins = 0, locked_until = NULL, active = 1`;
const args = ["wrangler", "d1", "execute", "DB", "--command", sql, env === "local" ? "--local" : "--remote", ...(env === "local" ? [] : ["--env", env])];
execFileSync("npx", args, { stdio: ["ignore", "ignore", "inherit"] });

console.log(`\n${flag === "--admin" ? "Admin" : "User"} "${username}" is ready on ${env}.`);
console.log(`Temporary password: ${password}`);
console.log("It has to be changed at the first sign-in.\n");
