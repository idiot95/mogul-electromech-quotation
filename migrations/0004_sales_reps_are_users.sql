-- Sales Reps are users: the Sales Rep on a quotation is picked from the users, and each user carries the contact
-- details and email template that the separate Sales Reps list (table `salesmen`, no longer used) used to hold.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN email_template TEXT;          -- body template used when emailing a quotation

ALTER TABLE q_quotes ADD COLUMN sales_rep_id INTEGER REFERENCES users(id);
CREATE INDEX idx_q_quotes_sales_rep ON q_quotes(sales_rep_id);

-- Each existing Sales Rep becomes a user, unless a user is already linked to them. These users can't sign in yet
-- (inactive, no password): an admin activates them and resets their password on the Users page when they need access.
INSERT INTO users (username, display_name, password_hash, role, salesman_id, active, must_change_password)
SELECT lower(replace(trim(s.name), ' ', '.'))
         || CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.username = lower(replace(trim(s.name), ' ', '.')))
                   OR (SELECT COUNT(*) FROM salesmen s2 WHERE lower(trim(s2.name)) = lower(trim(s.name))) > 1
                 THEN '.' || s.id ELSE '' END,
       trim(s.name), '!', 'user', s.id, 0, 1
FROM salesmen s
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.salesman_id = s.id);

UPDATE users SET
  email = COALESCE(email, (SELECT s.email FROM salesmen s WHERE s.id = users.salesman_id)),
  phone = COALESCE(phone, (SELECT s.phone FROM salesmen s WHERE s.id = users.salesman_id)),
  email_template = COALESCE(email_template, (SELECT s.email_template FROM salesmen s WHERE s.id = users.salesman_id))
WHERE salesman_id IS NOT NULL;

-- quotations keep their Sales Rep, now as a user
UPDATE q_quotes SET sales_rep_id = (SELECT MIN(u.id) FROM users u WHERE u.salesman_id = q_quotes.salesman_id)
WHERE salesman_id IS NOT NULL;
