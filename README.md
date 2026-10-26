# Mogul Workspace

Web workspace for **Mogul Electromech LLC**, built so business tools plug in as modules.
Module 1 is **Quotations**. Runs on Cloudflare's free tier (Worker + D1 + R2).

## What's in it

**Quotations**
- Customer drop-down with type-ahead; picking a customer fills payment, validity, delivery and VAT terms ("from customer" marker). New customers are added once from the same box.
- Enquiry ref, salesman, date, kind attention.
- **Paste from Excel or email** — Ctrl+V anywhere on the quote. Reads Excel's rich clipboard, tab-separated text or a numbered email list; finds the header row, maps columns (Sr, Description, Qty, Unit; Part No / Make / Size / Remarks are added to the description), skips banners, totals and repeated headers, joins wrapped lines, keeps section headings, spots the enquiry ref. A preview lets you change any column mapping before lines are added. Price columns are ignored unless mapped to Rate (rates are never filled from history).
- Keyboard grid: Enter moves down the Rate column, a pasted column of rates fills down, Ctrl+D fill down, Ctrl+Z undoes a paste, drag to reorder, row menu (insert, heading, duplicate, delete), drop an .xlsx/.csv file.
- Numbering `ME-YY-NNN`, revisions as `REV 01`, `REV 02` (older revision kept read-only).
- Print / Save as PDF in the Mogul letterhead layout (logo, stamp, TRN, amount in words). PDF file name = `ME-26-089 CUSTOMER NAME`.
- Email: opens the salesman's Outlook with To/Cc/subject/body from a per-salesman template and logs it on the quote. (Thread picker + automatic attachment come with Microsoft sign-in.)
- Workings: attach photos (phone camera), screenshots (paste) or files. Never printed.
- Quote list with search (number, customer, enquiry ref, item text), filters, CSV export.
- Home: last 4 weeks (or 1 week / 3 / 12 months) by customer, by salesman, largest quotes.

**Core** (shared by future modules): customers + CSV/Excel import, salesmen, company settings / letterhead, numbering, file storage (R2), paste engine.

Sign-in is **off for now** (by request). Microsoft sign-in will be added as API middleware in `worker/index.ts`.

## Layout

```
worker/            Hono API on Cloudflare Workers
  core/            settings, salesmen, customers, numbering, files
  modules/quotes/  quotations API (tables prefixed q_)
web/src/           React app (Vite)
  core/            shell, sidebar, shared dialogs
  modules/quotes/  editor, paste preview, grid, print document, list, home widget
shared/            paste engine (used by the browser; unit-tested)
migrations/        D1 schema + defaults (company details, 6 salesmen, Star Super Cement)
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
