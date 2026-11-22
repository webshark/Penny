-- One classification for what a row does to the household's money, plus the links the pairing
-- engine writes: a refund to the purchase it reverses, a repayment to the loan it pays, and the
-- two halves of a transfer between our own accounts. `kind` still drives the transaction tabs;
-- every spending and income report reads `flow_type` so transfers and refunds cannot inflate them.
ALTER TABLE transactions ADD COLUMN flow_type TEXT NOT NULL DEFAULT 'expense'
  CHECK (flow_type IN (
    'expense','income','refund','transfer_internal','investment','loan_drawdown','loan_repayment','fee'
  ));

-- No REFERENCES: links are advisory and may point at a row deleted with its source later.
ALTER TABLE transactions ADD COLUMN linked_txn_id INTEGER;
ALTER TABLE transactions ADD COLUMN transfer_pair_id INTEGER;
ALTER TABLE transactions ADD COLUMN linked_planned_id INTEGER;

-- Backfill. A positive expense on a card is a refund; a bank transfer is internal money.
UPDATE transactions SET flow_type = 'income' WHERE kind = 'income';
UPDATE transactions SET flow_type = 'transfer_internal' WHERE kind = 'transfer';
UPDATE transactions SET flow_type = 'refund' WHERE kind = 'expense' AND charged_amount > 0;

CREATE INDEX IF NOT EXISTS idx_transactions_flow_type ON transactions(workspace_id, flow_type);
CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(workspace_id, linked_txn_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_pair ON transactions(workspace_id, transfer_pair_id);

-- Every insert path (scrape, file import, sheet, manual, demo seed) gets the base classification
-- without each one having to remember it. Explicit values such as loan_drawdown are left alone.
DROP TRIGGER IF EXISTS trg_transactions_flow_insert;
CREATE TRIGGER trg_transactions_flow_insert
AFTER INSERT ON transactions
WHEN NEW.flow_type IN ('expense','income','transfer_internal')
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

-- The scraper can flip a pending row to completed with a different sign or kind.
DROP TRIGGER IF EXISTS trg_transactions_flow_update;
CREATE TRIGGER trg_transactions_flow_update
AFTER UPDATE OF kind, charged_amount ON transactions
WHEN NEW.flow_type IN ('expense','income','transfer_internal')
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

-- The single definition of spending: completed, not excluded, split rows expanded by
-- category_transactions, refunds counted as negative spend. A linked refund inherits the
-- purchase's category (or its largest split), so it nets against what was actually bought.
DROP VIEW IF EXISTS v_spend_rows;
CREATE VIEW v_spend_rows AS
SELECT
  ct.workspace_id AS workspace_id,
  ct.id AS transaction_id,
  ct.account_number AS account_number,
  ct.date AS date,
  ct.provider AS provider,
  CASE WHEN t.flow_type = 'refund'
       THEN COALESCE(
         (SELECT a.category_id FROM transaction_allocations a
          WHERE a.transaction_id = p.id ORDER BY a.amount_cents DESC LIMIT 1),
         p.category_id,
         ct.category_id)
       ELSE ct.category_id END AS category_id,
  ct.personal_amount AS personal_amount,
  -ct.personal_amount AS spend
FROM category_transactions ct
JOIN transactions t ON t.id = ct.id
LEFT JOIN transactions p ON p.id = t.linked_txn_id
WHERE ct.status = 'completed'
  AND ct.is_excluded = 0
  AND t.flow_type IN ('expense','refund','loan_repayment','fee')
  AND ct.charged_amount <> 0;

-- The single definition of cash flow: income minus everything that actually left the household.
-- Internal transfers and borrowed principal are real money but neutral, so they count as zero.
DROP VIEW IF EXISTS v_cash_rows;
CREATE VIEW v_cash_rows AS
SELECT
  id AS transaction_id,
  workspace_id,
  account_number,
  date,
  provider,
  kind,
  flow_type,
  charged_amount,
  CASE WHEN flow_type IN ('transfer_internal','loan_drawdown') THEN 0 ELSE charged_amount END AS cash_amount
FROM transactions
WHERE status = 'completed' AND is_excluded = 0;
