-- The ILS rate of the asset's currency when it was bought, so a foreign holding's gain splits into price and exchange rate.
ALTER TABLE assets ADD COLUMN cost_fx REAL;
