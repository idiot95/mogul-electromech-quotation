-- Core · sign-in and access control.
-- Users sign in with a username and password. Admins see everything; users see only the quotations they created
-- (quotation numbers stay one running sequence for everyone).

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name         TEXT NOT NULL,
  password_hash        TEXT NOT NULL,                       -- pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
  role                 TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  salesman_id          INTEGER REFERENCES salesmen(id),     -- the Sales Rep this user is, filled in on their quotes
  active               INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,          -- set when an admin creates the user or resets the password
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,                                -- after repeated wrong passwords
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per signed-in browser. The cookie carries a signed copy; this row is what sign-out and deactivation remove.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                             -- random, also inside the signed cookie
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Server-only values (the session signing key). Never returned by any API.
CREATE TABLE app_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Who created each quotation; quotations from before sign-in existed have none and are visible to admins only.
ALTER TABLE q_quotes ADD COLUMN created_by INTEGER REFERENCES users(id);
CREATE INDEX idx_q_quotes_created_by ON q_quotes(created_by);
