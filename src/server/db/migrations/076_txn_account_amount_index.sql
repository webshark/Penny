-- Every synced row looks for an imported-statement twin by account and amount. Without this index that lookup
-- scanned the whole workspace per row, so a first sync of several years slowed down quadratically.
CREATE INDEX IF NOT EXISTS idx_transactions_account_amount ON transactions(workspace_id, account_number, charged_amount);
