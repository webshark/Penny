-- A transaction can be partly business: the share belongs to a business, not the household.
-- The real amount stays in charged_amount (that is what the bank charged); personal_amount is
-- what the household actually spent, and every spending report reads that instead.
ALTER TABLE transactions ADD COLUMN business_share_pct INTEGER NOT NULL DEFAULT 0
  CHECK (business_share_pct BETWEEN 0 AND 100);

ALTER TABLE transactions ADD COLUMN personal_amount REAL GENERATED ALWAYS AS (
  CASE WHEN business_share_pct > 0
       THEN ROUND(charged_amount * (100 - business_share_pct) / 100.0, 2)
       ELSE charged_amount END
) VIRTUAL;

-- Category reporting reads the view, so it needs the personal amount too (split rows included).
DROP VIEW category_transactions;
CREATE VIEW category_transactions AS
SELECT t.id,t.workspace_id,t.account_number,t.date,t.processed_date,t.original_amount,t.original_currency,
 CASE WHEN a.transaction_id IS NULL THEN t.charged_amount ELSE -a.amount_cents / 100.0 END AS charged_amount,
 CASE WHEN a.transaction_id IS NULL THEN t.personal_amount
      WHEN t.business_share_pct > 0 THEN ROUND((-a.amount_cents / 100.0) * (100 - t.business_share_pct) / 100.0, 2)
      ELSE -a.amount_cents / 100.0 END AS personal_amount,
 t.charged_currency,t.description,t.memo,t.type,t.status,t.identifier,t.installment_number,t.installment_total,
 CASE WHEN a.transaction_id IS NULL THEN t.category_id ELSE a.category_id END AS category_id,t.category_source,t.provider,t.sync_run_id,t.dedup_hash,t.dedup_sequence,
 t.kind,t.needs_review,t.created_at,t.updated_at,t.ai_confidence,t.is_excluded,t.credential_id,t.owner
FROM transactions t LEFT JOIN transaction_allocations a ON a.transaction_id=t.id AND t.kind='expense';
