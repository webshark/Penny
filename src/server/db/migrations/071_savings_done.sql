-- "Money on the table" items the user acted on, with the yearly saving at the time, so the app can show what was actually saved.
CREATE TABLE savings_done (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  yearly REAL NOT NULL DEFAULT 0,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, key)
);
