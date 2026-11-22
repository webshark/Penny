-- A payback credit for a partly business expense has to carry the same business share, or the credit
-- lands fully in personal income and spending while the business part of the expense stayed out.
-- The credit's own share is kept here so unlinking gives it back exactly.
ALTER TABLE transaction_links ADD COLUMN prev_business_share_pct INTEGER NOT NULL DEFAULT 0;

-- Deleting the expense must restore that share too, so the trigger is recreated whole.
DROP TRIGGER transaction_links_delete;
CREATE TRIGGER transaction_links_delete BEFORE DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM transaction_links WHERE credit_id = OLD.id OR expense_id = OLD.id)
BEGIN
  UPDATE transactions SET
    kind = (SELECT prev_kind FROM transaction_links WHERE expense_id = OLD.id),
    category_id = (SELECT prev_category_id FROM transaction_links WHERE expense_id = OLD.id),
    business_share_pct = (SELECT prev_business_share_pct FROM transaction_links WHERE expense_id = OLD.id),
    updated_at = datetime('now')
  WHERE id IN (SELECT credit_id FROM transaction_links WHERE expense_id = OLD.id);
  DELETE FROM transaction_links WHERE credit_id = OLD.id OR expense_id = OLD.id;
END;
