-- A Bit credit that repays an expense should not count as income while the expense counts in full.
-- Linking them turns the credit into a positive expense in the expense's category, so every report
-- that already sums -personal_amount nets it out with no extra query changes.
-- The credit's own kind and category are kept here so unlinking restores them exactly.
CREATE TABLE transaction_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credit_id INTEGER NOT NULL REFERENCES transactions(id),
  expense_id INTEGER NOT NULL REFERENCES transactions(id),
  prev_kind TEXT NOT NULL,
  prev_category_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, credit_id)
);

CREATE INDEX idx_transaction_links_expense ON transaction_links(workspace_id, expense_id);

-- Deleting either side must not leave a credit looking like an expense:
-- the expense going away gives the credit its own kind and category back.
CREATE TRIGGER transaction_links_delete BEFORE DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM transaction_links WHERE credit_id = OLD.id OR expense_id = OLD.id)
BEGIN
  UPDATE transactions SET
    kind = (SELECT prev_kind FROM transaction_links WHERE expense_id = OLD.id),
    category_id = (SELECT prev_category_id FROM transaction_links WHERE expense_id = OLD.id),
    updated_at = datetime('now')
  WHERE id IN (SELECT credit_id FROM transaction_links WHERE expense_id = OLD.id);
  DELETE FROM transaction_links WHERE credit_id = OLD.id OR expense_id = OLD.id;
END;
