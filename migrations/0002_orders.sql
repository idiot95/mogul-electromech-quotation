-- Quotations module · orders received against a quote (won / partly won) and lost quotes.
-- A quote can receive several POs over time; each PO line records the qty and rate the customer actually ordered.

ALTER TABLE q_quotes ADD COLUMN lost_reason TEXT;   -- set when status = 'lost'
ALTER TABLE q_quotes ADD COLUMN lost_note   TEXT;
ALTER TABLE q_quotes ADD COLUMN outcome_at  TEXT;   -- when it was last marked won / lost

CREATE TABLE q_orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES q_quotes(id),
  po_number   TEXT,
  po_date     TEXT,                         -- YYYY-MM-DD
  note        TEXT,
  subtotal    REAL NOT NULL DEFAULT 0,      -- ordered value excl. VAT
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_q_orders_quote ON q_orders(quote_id);
CREATE INDEX idx_q_orders_date ON q_orders(po_date);

-- Lines are matched to the quote by position and keep a snapshot of what was quoted.
CREATE TABLE q_order_lines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES q_orders(id) ON DELETE CASCADE,
  pos          INTEGER NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  unit         TEXT,
  quoted_qty   REAL,
  quoted_rate  REAL,
  qty          REAL NOT NULL,
  rate         REAL,
  amount       REAL
);
CREATE INDEX idx_q_order_lines_order ON q_order_lines(order_id);
