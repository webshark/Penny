-- A pension / long-term-savings report an agent or advisor sends, extracted to JSON and imported
-- (docs/pension-report.md). The header and the report's own totals are kept here; each product
-- becomes an asset whose note is 'pension-report:...', and the insurance in it becomes policies.
-- Re-importing the same report updates it in place: (as_of, member, source) is the report's key.
CREATE TABLE pension_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  as_of TEXT NOT NULL,
  -- Empty rather than NULL, so the UNIQUE key also holds for reports that name no member or source.
  member TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  issued_at TEXT,
  total_savings REAL NOT NULL,
  products INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '{}',
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, as_of, member, source)
);
CREATE INDEX idx_pension_reports_workspace ON pension_reports(workspace_id, as_of DESC);

-- What the report says beyond the asset columns: tracks and their returns, the components of the
-- balance, the cover inside the fund, and the expected annuity. Kept as JSON so new report fields
-- do not need a migration; a re-import refreshes it.
ALTER TABLE assets ADD COLUMN details TEXT;
