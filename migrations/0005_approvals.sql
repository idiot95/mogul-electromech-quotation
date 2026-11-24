-- Quotations module · approval by an admin.
-- approval_status: none → pending (sent for approval) → approved | returned (changes requested).
-- Saving an approved quotation puts it back to none; while pending it can't be edited.

ALTER TABLE q_quotes ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'none'
  CHECK (approval_status IN ('none', 'pending', 'approved', 'returned'));
ALTER TABLE q_quotes ADD COLUMN approval_at TEXT;         -- when it last changed
ALTER TABLE q_quotes ADD COLUMN approval_by INTEGER REFERENCES users(id);
CREATE INDEX idx_q_quotes_approval ON q_quotes(approval_status);

-- every step, for the history on the quotation
CREATE TABLE q_approval_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES q_quotes(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('submitted', 'withdrawn', 'approved', 'returned', 'reset')),
  user_id     INTEGER REFERENCES users(id),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_q_approval_log_quote ON q_approval_log(quote_id, id);
