// Sign-in, sessions and users.
//
// Passwords: PBKDF2-SHA256 with a per-user salt; the iteration count is stored with each hash so it can be raised later.
// Sessions: a row in `sessions` plus an HttpOnly, SameSite=Strict cookie holding a signed copy of the session
// (id, user, role). Requests are checked against the signature alone; every 10 minutes the session row and the user are
// re-read, so sign-out, deactivation and role changes take effect within that time without a database trip per request.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext, SessionUser } from "../env";
import { bad, body, HttpError, intParam, notFound, str } from "./util";

const ITERATIONS = 100_000;
const SESSION_DAYS = 14;
const REVALIDATE_SECONDS = 10 * 60;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (b: ArrayBuffer | Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---------- passwords ----------

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [alg, iter, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2-sha256" || !iter || !salt || !hash) return false;
  return sameBytes(await pbkdf2(password, unb64(salt), Number(iter)), unb64(hash));
}

// compared against when the username doesn't exist, so a wrong username takes as long as a wrong password
const DUMMY_HASH = `pbkdf2-sha256$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

export function checkNewPassword(password: unknown, username: string): string {
  const p = typeof password === "string" ? password : "";
  if (p.length < 8) throw bad("The password must be at least 8 characters.");
  if (p.length > 200) throw bad("The password is too long.");
  if (p.toLowerCase() === username.toLowerCase()) throw bad("The password can't be the same as the username.");
  return p;
}

// ---------- signed session cookie ----------

interface Claims {
  s: string; // session id
  u: number; // user id
  un: string;
  n: string;
  r: "admin" | "user";
  mc: 0 | 1;
  iat: number; // when the claims were last read from the database (seconds)
  exp: number;
}

let keyPromise: Promise<CryptoKey> | null = null;
/** The HMAC key, created once per database and kept in app_secrets (never returned by any API). */
function signingKey(db: D1Database) {
  keyPromise ??= (async () => {
    await db.prepare("INSERT OR IGNORE INTO app_secrets (key, value) VALUES ('session_key', ?)").bind(random(32)).run();
    const row = await db.prepare("SELECT value FROM app_secrets WHERE key = 'session_key'").first<{ value: string }>();
    return crypto.subtle.importKey("raw", enc.encode(row!.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  })().catch((e) => {
    keyPromise = null;
    throw e;
  });
  return keyPromise;
}

async function sign(db: D1Database, claims: Claims) {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(db), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verify(db: D1Database, token: string | undefined): Promise<Claims | null> {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await signingKey(db), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(unb64url(body))) as Claims;
    return c.exp > Date.now() / 1000 ? c : null;
  } catch {
    return null;
  }
}

const cookieName = (c: Context<AppContext>) => (c.env.APP_ENV === "local" ? "mws" : "__Host-mws");

async function issue(c: Context<AppContext>, sid: string, u: UserRow, expiresAt: string) {
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.floor(Date.parse(expiresAt.replace(" ", "T") + "Z") / 1000);
  const claims: Claims = { s: sid, u: u.id, un: u.username, n: u.display_name, r: u.role, mc: u.must_change_password ? 1 : 0, iat: now, exp };
  setCookie(c, cookieName(c), await sign(c.env.DB, claims), {
    httpOnly: true,
    secure: c.env.APP_ENV !== "local",
    sameSite: "Strict",
    path: "/",
    maxAge: Math.max(0, exp - now),
  });
  return toUser(claims);
}

const toUser = (c: Claims): SessionUser => ({ id: c.u, username: c.un, name: c.n, role: c.r, mustChange: !!c.mc, sessionId: c.s });

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: "admin" | "user";
  active: number;
  must_change_password: number;
  failed_logins: number;
  locked_until: string | null;
}

// ---------- middleware ----------

const OPEN = new Set(["/api/health", "/api/auth/login", "/api/auth/logout"]);

/** Signs every API request in (except the open ones) and blocks cross-site writes. */
export const requireUser: MiddlewareHandler<AppContext> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    // SameSite=Strict already keeps the cookie off cross-site requests; this also refuses them outright
    const origin = c.req.header("origin");
    if (origin) {
      const from = new URL(origin);
      const sameSite = from.host === c.req.header("host") || from.host === new URL(c.req.url).host;
      // local development runs the app on one port and the API on another
      const localDev = c.env.APP_ENV === "local" && ["localhost", "127.0.0.1"].includes(from.hostname);
      if (!sameSite && !localDev) throw new HttpError(403, "Cross-site request refused");
    }
  }
  if (OPEN.has(c.req.path)) return next();

  const claims = await verify(c.env.DB, getCookie(c, cookieName(c)));
  if (!claims) throw new HttpError(401, "Please sign in.");
  let user = toUser(claims);
  if (Date.now() / 1000 - claims.iat > REVALIDATE_SECONDS) {
    const row = await c.env.DB.prepare(
      `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`,
    )
      .bind(claims.s)
      .first<UserRow & { expires_at: string }>();
    if (!row) {
      deleteCookie(c, cookieName(c), { path: "/", secure: c.env.APP_ENV !== "local" });
      throw new HttpError(401, "Please sign in again.");
    }
    user = await issue(c, claims.s, row, row.expires_at);
  }
  if (user.mustChange && !c.req.path.startsWith("/api/auth/")) throw new HttpError(403, "Please set a new password first.");
  c.set("user", user);
  return next();
};

export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.get("user")?.role !== "admin") throw new HttpError(403, "Only an admin can do this.");
  return next();
};

/** SQL condition (and its two arguments) for "this quotation belongs to the user, or the user is an admin". */
export const ownQuote = (u: SessionUser, col = "created_by") => ({ sql: `(? = 1 OR ${col} = ?)`, args: [u.role === "admin" ? 1 : 0, u.id] });

// ---------- auth routes ----------

const loginError = () => new HttpError(401, "Wrong username or password.");

export const authApi = new Hono<AppContext>()
  .post("/login", async (c) => {
    const b = await body(c);
    const username = (str(b.username, 60) || "").toLowerCase();
    const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
    const db = c.env.DB;
    const u = username ? await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>() : null;
    if (!u) {
      await verifyPassword(password, DUMMY_HASH);
      throw loginError();
    }
    if (u.locked_until && Date.parse(u.locked_until.replace(" ", "T") + "Z") > Date.now())
      throw new HttpError(429, `Too many wrong passwords. Try again after ${LOCK_MINUTES} minutes.`);
    if (!(await verifyPassword(password, u.password_hash)) || !u.active) {
      await db
        .prepare(
          `UPDATE users SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= ? THEN datetime('now', '+${LOCK_MINUTES} minutes') ELSE NULL END
           WHERE id = ?`,
        )
        .bind(MAX_FAILED, u.id)
        .run();
      throw loginError();
    }
    const sid = random(24);
    const [, , created] = await db.batch([
      db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(u.id),
      db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
      db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days')) RETURNING expires_at`).bind(sid, u.id),
    ]);
    return c.json(await issue(c, sid, u, (created.results[0] as { expires_at: string }).expires_at));
  })
  .post("/logout", async (c) => {
    const claims = await verify(c.env.DB, getCookie(c, cookieName(c)));
    if (claims) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(claims.s).run();
    deleteCookie(c, cookieName(c), { path: "/", secure: c.env.APP_ENV !== "local" });
    return c.json({ ok: true });
  })
  .get("/me", (c) => c.json(c.get("user")))
  .post("/password", async (c) => {
    const me = c.get("user");
    const b = await body(c);
    const db = c.env.DB;
    const u = await db.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first<UserRow>();
    if (!u || !(await verifyPassword(typeof b.current === "string" ? b.current : "", u.password_hash)))
      throw bad("The current password is wrong.");
    const next = checkNewPassword(b.next, u.username);
    const [, , row] = await db.batch([
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?").bind(await hashPassword(next), u.id),
      // signed out everywhere else
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(u.id, me.sessionId),
      db.prepare("SELECT expires_at FROM sessions WHERE id = ?").bind(me.sessionId),
    ]);
    return c.json(await issue(c, me.sessionId, { ...u, must_change_password: 0 }, (row.results[0] as { expires_at: string }).expires_at));
  });

// ---------- Sales Reps: every user can be picked as the Sales Rep on a quotation ----------

export const repsApi = new Hono<AppContext>().get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, display_name, active FROM users ORDER BY display_name COLLATE NOCASE").all();
  return c.json(results);
});

// ---------- users (admin) ----------

const USER_COLS = "id, username, display_name, email, phone, email_template, role, active, must_change_password, locked_until, created_at";
const contact = (b: Record<string, unknown>) => [str(b.email, 200), str(b.phone, 100), str(b.email_template, 5000)];

function cleanUsername(v: unknown) {
  const u = (str(v, 60) || "").toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(u)) throw bad("Username: 3–40 characters, letters, numbers, dot, dash or underscore.");
  return u;
}
const role = (v: unknown) => (v === "admin" ? "admin" : "user");

/** Refuses a change that would leave no active admin. */
async function keepAnAdmin(db: D1Database, id: number, nextRole: string, nextActive: boolean) {
  if (nextRole === "admin" && nextActive) return;
  const n = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").bind(id).first<{ n: number }>();
  if (!n?.n) throw bad("There must always be at least one active admin.");
}

export const usersApi = new Hono<AppContext>()
  .use(requireAdmin)
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT ${USER_COLS} FROM users ORDER BY role, display_name COLLATE NOCASE`).all();
    return c.json(results);
  })
  .post("/", async (c) => {
    const b = await body(c);
    const username = cleanUsername(b.username);
    const name = str(b.display_name, 100);
    if (!name) throw bad("Name is required.");
    const password = checkNewPassword(b.password, username);
    const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
    if (exists) throw bad("That username is taken.");
    const row = await c.env.DB.prepare(
      `INSERT INTO users (username, display_name, email, phone, email_template, password_hash, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING ${USER_COLS}`,
    )
      .bind(username, name, ...contact(b), await hashPassword(password), role(b.role))
      .first();
    return c.json(row, 201);
  })
  .put("/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    const b = await body(c);
    const name = str(b.display_name, 100);
    if (!name) throw bad("Name is required.");
    const active = !(b.active === false || b.active === 0);
    await keepAnAdmin(c.env.DB, id, role(b.role), active);
    const db = c.env.DB;
    const [row] = await db.batch([
      db
        .prepare(
          `UPDATE users SET display_name = ?, email = ?, phone = ?, email_template = ?, role = ?, active = ?, updated_at = datetime('now')
           WHERE id = ? RETURNING ${USER_COLS}`,
        )
        .bind(name, ...contact(b), role(b.role), active ? 1 : 0, id),
      // a deactivated user is signed out everywhere
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND ? = 0").bind(id, active ? 1 : 0),
    ]);
    if (!row.results[0]) throw notFound("User not found");
    return c.json(row.results[0]);
  })
  .post("/:id/password", async (c) => {
    const id = intParam(c.req.param("id"));
    const b = await body(c);
    const db = c.env.DB;
    const u = await db.prepare("SELECT username FROM users WHERE id = ?").bind(id).first<{ username: string }>();
    if (!u) throw notFound("User not found");
    const password = checkNewPassword(b.password, u.username);
    await db.batch([
      db
        .prepare("UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?")
        .bind(await hashPassword(password), id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    ]);
    return c.json({ ok: true });
  });
