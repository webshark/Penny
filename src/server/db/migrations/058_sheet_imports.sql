-- One save of the smart sheet, so undo survives a refresh and removes both kinds of row it wrote:
-- manual rows (provider 'cash'/'manual') and statement rows (provider 'file', one sync run per account).
CREATE TABLE sheet_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  added INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sheet_import_rows (
  sheet_import_id INTEGER NOT NULL REFERENCES sheet_imports(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL,
  PRIMARY KEY (sheet_import_id, transaction_id)
);

CREATE INDEX idx_sheet_imports_workspace ON sheet_imports(workspace_id, created_at DESC);
