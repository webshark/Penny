-- A share keeps its expense's description and date, so it survives the transaction being replaced (a pending charge
-- that completes under a new row) or deleted: what someone owes is never silently lost.
ALTER TABLE expense_shares ADD COLUMN description TEXT;
ALTER TABLE expense_shares ADD COLUMN date TEXT;
UPDATE expense_shares SET
  description = (SELECT t.description FROM transactions t WHERE t.id = expense_shares.transaction_id),
  date = (SELECT t.date FROM transactions t WHERE t.id = expense_shares.transaction_id);
