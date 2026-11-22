-- A purchase you know is coming before the bank or card has charged it. When the real row
-- arrives it is linked (status 'matched'), stops counting as planned, and carries the
-- category / owner / tags chosen in advance. account is the account_number as stored on
-- transactions; account_kind decides whether the date is the statement date (card) or the
-- debit date (bank). Manual items have no account and are never matched automatically.
CREATE TABLE planned_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  account TEXT,
  account_kind TEXT NOT NULL DEFAULT 'manual' CHECK (account_kind IN ('bank','card','manual')),
  installments INTEGER NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 60),
  match_pattern TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  owner TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','matched','cancelled')),
  matched_txn_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  rejected_txn_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX idx_planned_workspace_status ON planned_items(workspace_id, status, date);
CREATE INDEX idx_planned_matched ON planned_items(workspace_id, matched_txn_id);
