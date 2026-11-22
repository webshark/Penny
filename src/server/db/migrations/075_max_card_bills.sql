-- The bank's monthly Max bill ("מקס איט פיננסים", "לאומי קארד") wasn't recognised as a card bill, so households with
-- Max connected counted their card spending twice: each purchase from the card, and the bill again from the bank.
-- Same rule as at sync: only bank rows, only where a card company is connected. The flow-type trigger follows the kind.
UPDATE transactions SET kind = 'transfer'
WHERE kind = 'expense' AND charged_amount < 0
  AND provider IN ('openBanking','hapoalim','leumi','mizrahi','discount','mercantile','beinleumi','otsarHahayal','pagi','yahav','massad','union','oneZero')
  AND (description LIKE '%מקס איט%' OR description LIKE '%מקס-איט%' OR TRIM(description) = 'מקס'
       OR description LIKE 'מקס %' OR description LIKE '% מקס' OR description LIKE '% מקס %'
       OR description LIKE '%לאומי קארד%' OR description LIKE '%אמקס%')
  AND workspace_id IN (SELECT workspace_id FROM bank_credentials
                       WHERE provider IN ('isracard','cal','max','amex','beyahadBishvilha','behatsdaa'));
