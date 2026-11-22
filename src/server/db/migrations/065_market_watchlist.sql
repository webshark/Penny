-- Symbols the household follows on the Markets page. Per workspace, not per profile:
-- the market is shared, and so is the list of things worth watching.
CREATE TABLE market_watchlist (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, symbol)
);