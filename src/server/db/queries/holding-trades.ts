import "server-only";

import { getDb } from "../index";
import { holdingFromTrades, type HoldingTrade } from "@/lib/holding-trades";

const COLUMNS = "id, date, kind, quantity, price, fee, note";

export function listTrades(workspaceId: number, assetId: number): HoldingTrade[] {
  return getDb().prepare(`SELECT ${COLUMNS} FROM holding_trades WHERE workspace_id = ? AND asset_id = ? ORDER BY date DESC, id DESC`).all(workspaceId, assetId) as HoldingTrade[];
}

/** After any change: the holding's quantity and cost basis follow its trades. A holding with no trades keeps what was typed. */
function syncHolding(workspaceId: number, assetId: number) {
  const trades = listTrades(workspaceId, assetId);
  if (trades.length === 0) return;
  const h = holdingFromTrades(trades);
  getDb().prepare("UPDATE assets SET quantity = ?, cost_basis = ? WHERE workspace_id = ? AND id = ?").run(h.quantity, h.costBasis, workspaceId, assetId);
}

/** Adds a trade to a holding of this workspace; null when the holding is not found or is a debt. */
export function addTrade(workspaceId: number, assetId: number, t: Omit<HoldingTrade, "id">): HoldingTrade | null {
  const db = getDb();
  return db.transaction(() => {
    const asset = db.prepare("SELECT is_liability FROM assets WHERE workspace_id = ? AND id = ?").get(workspaceId, assetId) as { is_liability: number } | undefined;
    if (!asset || asset.is_liability) return null;
    const id = Number(db.prepare("INSERT INTO holding_trades (workspace_id, asset_id, date, kind, quantity, price, fee, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(workspaceId, assetId, t.date, t.kind, t.quantity, t.price, t.fee, t.note).lastInsertRowid);
    syncHolding(workspaceId, assetId);
    return { id, ...t };
  })();
}

export function deleteTrade(workspaceId: number, tradeId: number): boolean {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare("SELECT asset_id AS assetId FROM holding_trades WHERE workspace_id = ? AND id = ?").get(workspaceId, tradeId) as { assetId: number } | undefined;
    if (!row) return false;
    db.prepare("DELETE FROM holding_trades WHERE workspace_id = ? AND id = ?").run(workspaceId, tradeId);
    syncHolding(workspaceId, row.assetId);
    return true;
  })();
}
