-- Every link the pairing engine makes is recorded with the exact state it replaced, so the user can
-- see what was matched automatically and undo it. A cancelled match also locks its rows, otherwise
-- the next sync would pair them again and hide the same real expense.
ALTER TABLE transactions ADD COLUMN pairing_locked INTEGER NOT NULL DEFAULT 0;

CREATE TABLE flow_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('transfer','refund','loan_drawdown','loan_repayment')),
  primary_txn_id INTEGER NOT NULL,
  other_txn_id INTEGER,
  -- JSON array of the rows the match changed, with their previous classification.
  before_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE INDEX idx_flow_matches_workspace ON flow_matches(workspace_id, status);
CREATE UNIQUE INDEX idx_flow_matches_active
  ON flow_matches(workspace_id, kind, primary_txn_id) WHERE status = 'active';

-- Same base classification as 062, but an undo sets pairing_locked in the same statement and must
-- not be reclassified by the trigger it fires.
DROP TRIGGER IF EXISTS trg_transactions_flow_insert;
CREATE TRIGGER trg_transactions_flow_insert
AFTER INSERT ON transactions
WHEN NEW.flow_type IN ('expense','income','transfer_internal') AND NEW.pairing_locked = 0
BEGIN
  UPDATE transactions
  SET flow_type = CASE
    WHEN NEW.kind = 'income' THEN 'income'
    WHEN NEW.kind = 'transfer' THEN 'transfer_internal'
    WHEN NEW.charged_amount > 0 THEN 'refund'
    ELSE 'expense' END
  WHERE id = NEW.id
    AND flow_type <> CASE
    WHEN NEW.kind = 'income' THEN 'income'
    WHEN NEW.kind = 'transfer' THEN 'transfer_internal'
    WHEN NEW.charged_amount > 0 THEN 'refund'
    ELSE 'expense' END;
END;

DROP TRIGGER IF EXISTS trg_transactions_flow_update;
CREATE TRIGGER trg_transactions_flow_update
AFTER UPDATE OF kind, charged_amount ON transactions
WHEN NEW.flow_type IN ('expense','income','transfer_internal') AND NEW.pairing_locked = 0
BEGIN
  UPDATE transactions
  SET flow_type = CASE
    WHEN NEW.kind = 'income' THEN 'income'
    WHEN NEW.kind = 'transfer' THEN 'transfer_internal'
    WHEN NEW.charged_amount > 0 THEN 'refund'
    ELSE 'expense' END
  WHERE id = NEW.id
    AND flow_type <> CASE
    WHEN NEW.kind = 'income' THEN 'income'
    WHEN NEW.kind = 'transfer' THEN 'transfer_internal'
    WHEN NEW.charged_amount > 0 THEN 'refund'
    ELSE 'expense' END;
END;
