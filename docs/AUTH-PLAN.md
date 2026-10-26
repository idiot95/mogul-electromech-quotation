# Sign-in and user access: plan

Status: **plan only.** Sign-in is off today; every API route in `worker/index.ts` is open.

## Goals

1. Everyone signs in with their **Microsoft 365** account (the company already uses it for mail).
2. An admin decides **who sees what**, per module, from a Users page.
3. A signed-in salesman is **the salesman on their quotes**: picked automatically, nothing to choose.
4. The same sign-in later lets the app send quotes through the user's own Outlook (thread picker and attachment), so it's built once.

## Sign-in: Microsoft Entra ID, handled by the Worker

- Register one app in Entra (Azure portal → App registrations). Single tenant, so only `@mogulelectromech.com` accounts can sign in.
  Redirect URIs: `https://quotes.mogulelectromech.com/api/auth/callback` and the `quotes-staging` one.
- The Worker runs the OpenID Connect sign-in (authorization code + PKCE). It keeps a signed, HttpOnly session cookie and stores
  the Microsoft refresh token encrypted in D1. Later, Outlook sending uses that token for Microsoft Graph (`Mail.Send`, `Mail.Read`).
- New routes: `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/me`.
- **Why not Cloudflare Access alone:** it can gate the site, but it doesn't give the app a Microsoft Graph token. Graph is what
  Outlook sending needs. Access can still be added in front later as an extra wall.

Secrets (Worker secrets, never in git): `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`, `SESSION_SECRET`.

## Who sees what

**Users** are separate from **salesmen**. A user can be linked to one salesman record, and that link is what fills in the salesman.

| Role | Quotations | Customers | Settings, salesmen, users |
|---|---|---|---|
| **Admin** | All quotes, edit | Edit | Edit |
| **Manager** | All quotes, edit; all reports | Edit | View |
| **Salesman** | **Own quotes only** (where `salesman_id` is their linked salesman); create, revise, print, email | View, add new | — |
| **Viewer** (e.g. accounts) | All quotes and orders, read-only | View | — |

Roles are **per module**. Adding the ERP or another module later doesn't widen anyone's access by default.

"Own quotes" can be widened per user with a **scope**: `own` · `team` (a list of salesmen, e.g. a sales lead covering two others) ·
`all`. The table above shows each role's default scope.

### Data (new migration)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,            -- Microsoft sign-in email
  entra_oid TEXT UNIQUE,                 -- Microsoft account id, filled on first sign-in
  name TEXT,
  salesman_id INTEGER REFERENCES salesmen(id),  -- the salesman this user *is* (optional)
  is_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE user_module_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,                  -- 'quotes', later 'erp', ...
  role TEXT NOT NULL,                    -- manager | salesman | viewer
  scope TEXT NOT NULL DEFAULT 'own',     -- own | team | all
  PRIMARY KEY (user_id, module)
);
CREATE TABLE user_team (                 -- for scope = 'team': which salesmen's quotes they also see
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salesman_id INTEGER NOT NULL REFERENCES salesmen(id),
  PRIMARY KEY (user_id, salesman_id)
);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, refresh_token_enc TEXT, expires_at TEXT NOT NULL);
ALTER TABLE q_quotes ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE q_quotes ADD COLUMN updated_by INTEGER REFERENCES users(id);
```

Only people added on the Users page can get in. Signing in with an unknown company account shows "ask an admin for access".
The first admins come from a Worker variable `ADMIN_EMAILS`, so nobody gets locked out on day one.

## Enforcement (server side, never just hidden buttons)

- Middleware in `worker/index.ts` (where the comment already marks it) loads the user and their access into the request context.
  Every `/api/*` route except `/api/auth/*` and `/api/health` returns 401 without a session.
- Each module checks its own access. The quotes API gets one helper, `quoteScope(c)`. It returns the allowed salesman ids, or `null`
  for all, and is applied to **every** quote query: list, get, revise, print, email, orders, CSV export and home-page totals.
  Opening someone else's quote by URL returns 404, not the data.
- Files and workings are checked through the quote they belong to.
- Settings, salesmen and users endpoints need admin; managers get read-only access.
- `q_emails.sent_by` and the new `created_by` / `updated_by` columns are filled in from the signed-in user automatically.

## Salesman filled in automatically

- `/api/me` returns `{ name, email, salesman: { id, name, email, phone, email_template }, modules: { quotes: { role, scope } } }`.
- New quote: the salesman is the signed-in user's linked salesman. This replaces today's "last salesman used" memory in
  `QuoteEditor.tsx`.
- Users with a **salesman** role see the field locked. The server also forces `salesman_id` to their own on create and update, whatever the
  browser sends. Managers and admins keep the drop-down, defaulting to themselves if linked.
- The email template, signature and phone on the printed quote come from that salesman record, as today.

## UI changes

- Sign-in screen ("Sign in with Microsoft"); name and sign-out in the sidebar.
- The sidebar and pages show only the modules and actions the user has. The quote list, filters and home widgets only offer the salesmen in
  their scope.
- **Settings → Users** (admin): add by email, link to a salesman, set role and scope per module, deactivate.

## Rollout

1. Entra app registration (needs an M365 admin, ~10 minutes) and Worker secrets on staging.
2. Build sign-in, users, access tables and middleware; test on `quotes-staging` with real accounts.
3. Add the team on staging, then copy the user list to live.
4. Turn on in live. Existing quotes keep their `salesman_id`, so each salesman sees their own history right away.
5. Later: Outlook sending through Graph using the same sign-in.

## To decide

- Can salesmen see **each other's** quotes (read-only), or strictly their own?
- Should salesmen see the **home-page totals for everyone**, or only their own?
- Can salesmen **edit customer** terms (payment, VAT, delivery), or only add new customers?
- Who else needs access besides the 6 salesmen (accounts, management)? What should they see?
