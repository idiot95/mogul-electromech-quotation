-- Mogul Workspace · core services + Quotations module
-- Core tables are unprefixed; module tables carry their module prefix (q_ = Quotations).

-- ---------- CORE ----------

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON
);

CREATE TABLE salesmen (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  email_template TEXT,           -- body template used when emailing a quote
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  address         TEXT,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  trn             TEXT,
  payment_terms   TEXT,          -- default terms copied onto new quotes
  validity        TEXT,
  delivery_terms  TEXT,
  vat_terms       TEXT,
  notes           TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);

-- One counter per series per year, e.g. series 'ME', year 26 -> ME-26-001
CREATE TABLE number_series (
  series TEXT NOT NULL,
  year   INTEGER NOT NULL,
  last   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series, year)
);

-- Files stored in R2 (working photos, screenshots, attachments)
CREATE TABLE files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key      TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  owner_type  TEXT NOT NULL,     -- e.g. 'quote'
  owner_id    INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_files_owner ON files(owner_type, owner_id);

-- ---------- QUOTATIONS MODULE ----------

CREATE TABLE q_quotes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  base_number     TEXT NOT NULL,              -- ME-26-089 (shared by all revisions)
  rev             INTEGER NOT NULL DEFAULT 0, -- 0 = original, 1 = REV 01 ...
  quote_date      TEXT NOT NULL,              -- YYYY-MM-DD
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | printed | emailed | cancelled
  customer_id     INTEGER REFERENCES customers(id),
  customer_name   TEXT NOT NULL DEFAULT '',   -- snapshot printed on the document
  customer_address TEXT,
  attention       TEXT,
  enquiry_ref     TEXT,
  salesman_id     INTEGER REFERENCES salesmen(id),
  payment_terms   TEXT,
  validity        TEXT,
  delivery_terms  TEXT,
  vat_terms       TEXT,
  vat_rate        REAL NOT NULL DEFAULT 5,
  currency        TEXT NOT NULL DEFAULT 'AED',
  subtotal        REAL NOT NULL DEFAULT 0,
  vat_amount      REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  notes           TEXT,                       -- printed remarks
  internal_notes  TEXT,                       -- never printed
  superseded_by   INTEGER REFERENCES q_quotes(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (base_number, rev)
);
CREATE INDEX idx_q_quotes_date ON q_quotes(quote_date);
CREATE INDEX idx_q_quotes_customer ON q_quotes(customer_id);
CREATE INDEX idx_q_quotes_number ON q_quotes(base_number);

CREATE TABLE q_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES q_quotes(id) ON DELETE CASCADE,
  pos         INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'item',  -- item | heading
  description TEXT NOT NULL DEFAULT '',
  qty         REAL,
  unit        TEXT,
  rate        REAL,
  amount      REAL
);
CREATE INDEX idx_q_lines_quote ON q_lines(quote_id, pos);

CREATE TABLE q_emails (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES q_quotes(id) ON DELETE CASCADE,
  to_addr     TEXT,
  cc_addr     TEXT,
  subject     TEXT,
  method      TEXT NOT NULL DEFAULT 'mailto',  -- mailto | outlook (after Microsoft sign-in)
  sent_by     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_q_emails_quote ON q_emails(quote_id);

-- ---------- DEFAULTS ----------

INSERT INTO settings (key, value) VALUES
 ('company', '{"name":"Mogul Electromech LLC","address":"C-08 Bena Warehouse, Ras Al Khor Ind. Area\nDubai, United Arab Emirates","phone":"+971 4 227 0753","fax":"+971 4 227 0653","email":"sales@mogulelectromech.com","trn":"100337875700003"}'),
 ('quotes', '{"series":"ME","vatRate":5,"currency":"AED","paymentTerms":"100% in advance with PO","validity":"20 days","deliveryTerms":"2–3 weeks, DDP your site","vatTerms":"VAT 5% extra as per UAE law","footerNote":"This is a computer generated message, hence does not require any signature.","showVatAmount":true,"defaultUnit":"Nos."}');

INSERT INTO salesmen (name) VALUES ('Taher'), ('Mustafa'), ('Mehalm'), ('Husain'), ('Murtaza'), ('Mustansir');

INSERT INTO customers (name, address, payment_terms, validity, delivery_terms, vat_terms) VALUES
 ('STAR SUPER CEMENT INDUSTRIES LLC', 'B-233, Jebel Ali Industrial Area-2
Dubai, UAE', '100% in advance with PO', '20 days', '2–3 weeks, DDP your site', 'VAT 5% extra as per UAE law');
