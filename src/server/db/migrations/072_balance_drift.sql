-- The last balance check per bank account: synced balance change minus the transactions in between (null = couldn't be checked).
ALTER TABLE account_balances ADD COLUMN drift REAL;
