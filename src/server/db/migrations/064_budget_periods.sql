-- Budget v2: the monthly amount in `budgets` is the default for future months, and each period
-- keeps its own lines. Editing a budget changes this period and the default, never last month's
-- record. `carry_in` is filled from the previous period's leftover per the category's rule.
ALTER TABLE budgets ADD COLUMN rollover_rule TEXT NOT NULL DEFAULT 'none'
  CHECK (rollover_rule IN ('none','positive','negative','both'));

CREATE TABLE budget_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- YYYY-MM of the calendar month the household month starts in.
  period TEXT NOT NULL,
  start_day INTEGER NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, period)
);

CREATE TABLE budget_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  base_amount REAL NOT NULL DEFAULT 0,
  carry_in REAL NOT NULL DEFAULT 0,
  moves REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, period, category_id)
);

CREATE INDEX idx_budget_periods_workspace ON budget_periods(workspace_id, period);
CREATE INDEX idx_budget_lines_period ON budget_lines(workspace_id, period);
