-- Editing the business share of an expense must reach the credits that repay it. Otherwise the
-- expense moves to its new split while the credit keeps the old one, and the personal totals show a
-- split that belongs to neither. A trigger covers every write path, not just the edit sheet.
CREATE TRIGGER transaction_links_share_update AFTER UPDATE OF business_share_pct ON transactions
WHEN EXISTS (SELECT 1 FROM transaction_links WHERE expense_id = NEW.id)
BEGIN
  UPDATE transactions SET business_share_pct = NEW.business_share_pct
  WHERE id IN (SELECT credit_id FROM transaction_links WHERE expense_id = NEW.id)
    AND business_share_pct != NEW.business_share_pct;
END;
