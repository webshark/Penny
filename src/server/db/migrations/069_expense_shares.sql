-- Who owes their part of an expense: a roommate, a trip, a shared gift.
-- Settling marks the share paid back; the transaction itself never changes.
CREATE TABLE expense_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL,
  person TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_expense_shares_txn ON expense_shares(workspace_id, transaction_id);
CREATE INDEX idx_expense_shares_person ON expense_shares(workspace_id, person);
