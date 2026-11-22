-- Credit scores the user copies from their credit reports (Israel's credit data system), to follow the trend.
-- Nothing is fetched: bureaus give reports to the person, who types the score here.
CREATE TABLE credit_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  bureau TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_credit_scores_ws ON credit_scores(workspace_id, date);
