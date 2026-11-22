import "server-only";

import { getDb } from "../index";

/** The symbols this workspace follows on Markets, oldest first. */
export function listWatchedSymbols(workspaceId: number): string[] {
  const rows = getDb()
    .prepare("SELECT symbol FROM market_watchlist WHERE workspace_id = ? ORDER BY added_at, symbol")
    .all(workspaceId) as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

/** Adds a symbol; false when it was already there (the page can then just refresh). */
export function addWatchedSymbol(workspaceId: number, symbol: string): boolean {
  const result = getDb()
    .prepare("INSERT OR IGNORE INTO market_watchlist(workspace_id, symbol) VALUES (?, ?)")
    .run(workspaceId, symbol);
  return result.changes > 0;
}

export function removeWatchedSymbol(workspaceId: number, symbol: string): void {
  getDb().prepare("DELETE FROM market_watchlist WHERE workspace_id = ? AND symbol = ?").run(workspaceId, symbol);
}