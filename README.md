# Mogul Workspace

Web workspace for **Mogul Electromech LLC**, built so business tools plug in as modules.
Module 1 is **Quotations**. Runs on Cloudflare's free tier (Worker + D1 + R2).

## What's in it

**Quotations**
- Customer drop-down with type-ahead; picking a customer fills payment, validity, delivery and VAT terms ("from customer" marker). New customers are added once from the same box.
- Enquiry ref, Sales Rep, date, kind attention.
- **Paste from Excel or email** — Ctrl+V anywhere on the quote. Reads Excel's rich clipboard, tab-separated text or a numbered email list; finds the header row, maps columns (Sr, Description, Qty, Unit; Part No / Make / Size / Remarks are added to the description), skips banners, totals and repeated headers, joins wrapped lines, keeps section headings, spots the enquiry ref. A preview lets you change any column mapping before lines are added. Price columns are ignored unless mapped to Rate (rates are never filled from history).
- **Import PDFs, screenshots and emails** — drop the file on the lines, use Import file, or paste a screenshot (Win+Shift+S, Ctrl+V). PDFs are read from their text (scanned PDFs and images by OCR, free, in the browser); emails (.eml / .msg) by their largest table, else their text, else their PDF / image / Excel attachment. The preview shows the original beside the lines, and the original is kept in the quote's Workings.
- **Won / lost** — record each customer PO (number, date, PO copy, lines with ordered qty and PO rate; several POs per quote); status becomes Won or Partly won from what was ordered. Lost asks for a reason. Home shows orders received, win rate, quotes awaiting a reply and lost reasons.
- Spreadsheet-style grid: arrow keys move the active cell, Shift+arrows / drag select a range, type to overwrite, Enter/F2 to edit, Enter on Unit opens its pick list, Ctrl+C/X/V copy and paste cell blocks (round-trips with Excel), Delete clears, Ctrl+D fill down, Ctrl+Z undo, drag to reorder, row menu (insert, heading, duplicate, delete), drop an .xlsx/.csv file.
- Numbering `ME-YY-NNN`, revisions as `REV 01`, `REV 02` (older revision kept read-only).
- Print / Save as PDF in the Mogul letterhead layout (logo, stamp, TRN, amount in words). PDF file name = `ME-26-089 CUSTOMER NAME`. Multi-page quotes repeat the table header, never split a line, keep section headings with their first item and totals with the table, and print "ME-26-089 · Customer" and "Page x of y" on every page.
- Email: opens the Sales Rep's Outlook with To/Cc/subject/body from a per-rep template and logs it on the quote.
- Workings: attach photos (phone camera), screenshots (paste) or files. Never printed.
- Quote list with search (number, customer, enquiry ref, item text), filters, CSV export.
- Dashboard: last 4 weeks (or 1 week / 3 / 12 months) by customer, by Sales Rep, largest quotes.

**Core** (shared by future modules): customers + CSV/Excel import, users (also the Sales Reps), company settings / letterhead, numbering, file storage (R2), paste engine.

**Sign-in and access** — username and password (PBKDF2), managed by an admin on the Users page. Users see and edit only the
quotations they created (quotation numbers stay one running sequence); admins see everything and manage users, Sales Reps and
settings. Sales Reps are the users: a new quotation's Sales Rep is the signed-in user (any active user can be picked), and
each user's Full Name, Email, Phone and email template are used on the quotation and in the email. New users and password resets get a temporary password
that must be changed at first sign-in; 5 wrong passwords lock the account for 15 minutes. Sessions are a signed HttpOnly,
SameSite=Strict cookie, re-checked against the database every 10 minutes (sign-out and deactivation take effect within that).
First admin of an environment: `node scripts/create-user.mjs staging|production <username> "<Full Name>" --admin`.

## Layout

```
worker/            Hono API on Cloudflare Workers
  core/            settings, salesmen, customers, numbering, files
  modules/quotes/  quotations API (tables prefixed q_)
web/src/           React app (Vite + Mantine UI, brand theme in theme.ts)
  core/            shell, sidebar, shared dialogs
  modules/quotes/  editor, paste preview, grid, print document, list, home widget
shared/            paste engine + table layout from PDF/OCR word positions (used by the browser; unit-tested)
migrations/        D1 schema + defaults (company details, Star Super Cement); the first 6 Sales Reps became users in 0004
test/              paste-engine tests — add real enquiries here
```

A new module = `worker/modules/<id>/` + `web/src/modules/<id>/` + one line in each `modules/index.ts`, with its own prefixed tables in a new migration.

## Develop

```bash
npm install
npm run db:migrate:local
npx vite build && npx wrangler dev     # http://localhost:8787 (API + built app)
# or, for hot reload: `npm run dev:api` in one terminal and `npm run dev` (http://localhost:5173) in another
npm test && npm run typecheck
```

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md). Staging deploys from `staging` / `claude/**` branches, live deploys from `main`.
Domain / DNS move away from Wix: [docs/DNS-MIGRATION.md](docs/DNS-MIGRATION.md).
