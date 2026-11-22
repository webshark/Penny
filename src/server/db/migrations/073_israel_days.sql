-- Synced dates were stored as the scraper's UTC instants, so a charge on the 1st (Israeli midnight = 21:00/22:00Z
-- the day before) fell out of both months' totals. migrate.ts rewrites date and processed_date to the Israeli
-- calendar day after this file runs; dedup hashes are stored, so existing rows still match on the next sync.
SELECT 1;
