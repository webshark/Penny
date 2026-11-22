import "server-only";

import { getDb } from "../index";
import { israelDay } from "@/server/lib/date-utils";
import { balanceDrift } from "@/lib/balance-drift";
import { LIABILITY_TYPES, type AssetInput, type AssetType } from "@/lib/types";

export interface AssetRow extends AssetInput {
  id: number;
  isLiability: boolean;
}

const COLUMNS = `id, name, type, currency, symbol, quantity, manual_value as manualValue,
  cost_basis as costBasis, liquid, is_liability as isLiability, note, fee_deposit as feeDeposit,
  fee_balance as feeBalance, monthly_deposit as monthlyDeposit, interest_rate as interestRate, monthly_payment as monthlyPayment,
  fund_id as fundId, fund_source as fundSource, city, street, rooms, size_m2 as sizeM2,
  purchase_price as purchasePrice, purchase_month as purchaseMonth, cost_fx as costFx`;

const isLiabilityType = (t: AssetType) => (LIABILITY_TYPES as readonly string[]).includes(t);

const homeValues = (a: AssetInput) =>
  [a.city ?? null, a.street ?? null, a.rooms ?? null, a.sizeM2 ?? null, a.purchasePrice ?? null, a.purchaseMonth ?? null, a.costFx ?? null];

export function listAssets(workspaceId: number): AssetRow[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM assets WHERE workspace_id = ? ORDER BY is_liability, name`)
    .all(workspaceId) as (Omit<AssetRow, "liquid" | "isLiability"> & { liquid: number; isLiability: number })[];
  return rows.map((r) => ({ ...r, liquid: r.liquid === 1, isLiability: r.isLiability === 1 }));
}

export function createAssets(workspaceId: number, inputs: AssetInput[]): number {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO assets (workspace_id, name, type, currency, symbol, quantity, manual_value, cost_basis, liquid, is_liability, note,
       fee_deposit, fee_balance, monthly_deposit, interest_rate, monthly_payment, fund_id, fund_source,
       city, street, rooms, size_m2, purchase_price, purchase_month, cost_fx)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (const a of inputs) {
      stmt.run(workspaceId, a.name, a.type, a.currency, a.symbol, a.quantity, a.manualValue, a.costBasis, a.liquid ? 1 : 0, isLiabilityType(a.type) ? 1 : 0, a.note,
        a.feeDeposit, a.feeBalance, a.monthlyDeposit, a.interestRate, a.monthlyPayment, a.fundId ?? null, a.fundSource ?? null, ...homeValues(a));
    }
  })();
  return inputs.length;
}

export function updateAsset(workspaceId: number, id: number, a: AssetInput): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE assets SET name = ?, type = ?, currency = ?, symbol = ?, quantity = ?, manual_value = ?,
           cost_basis = ?, liquid = ?, is_liability = ?, note = ?, fee_deposit = ?, fee_balance = ?,
           monthly_deposit = ?, interest_rate = ?, monthly_payment = ?, fund_id = ?, fund_source = ?,
           city = ?, street = ?, rooms = ?, size_m2 = ?, purchase_price = ?, purchase_month = ?, cost_fx = ?
         WHERE workspace_id = ? AND id = ?`
      )
      .run(a.name, a.type, a.currency, a.symbol, a.quantity, a.manualValue, a.costBasis, a.liquid ? 1 : 0, isLiabilityType(a.type) ? 1 : 0, a.note,
        a.feeDeposit, a.feeBalance, a.monthlyDeposit, a.interestRate, a.monthlyPayment, a.fundId ?? null, a.fundSource ?? null, ...homeValues(a), workspaceId, id)
      .changes > 0
  );
}

export function deleteAsset(workspaceId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM assets WHERE workspace_id = ? AND id = ?").run(workspaceId, id).changes > 0;
}

export function saveSnapshots(date: string, values: { assetId: number; valueIls: number }[]) {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO asset_snapshots (asset_id, date, value_ils) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET value_ils = excluded.value_ils"
  );
  db.transaction(() => values.forEach((v) => stmt.run(v.assetId, date, v.valueIls)))();
}

export function saveManualNetWorth(workspaceId: number, date: string, netWorth: number) {
  getDb()
    .prepare("INSERT INTO net_worth_manual (workspace_id, date, net_worth) VALUES (?, ?, ?) ON CONFLICT(workspace_id, date) DO UPDATE SET net_worth = excluded.net_worth")
    .run(workspaceId, date, netWorth);
}

export function deleteManualNetWorth(workspaceId: number, date: string): boolean {
  return getDb().prepare("DELETE FROM net_worth_manual WHERE workspace_id = ? AND date = ?").run(workspaceId, date).changes > 0;
}

export function saveDailyNetWorth(workspaceId: number, date: string, netWorth: number) {
  getDb()
    .prepare("INSERT INTO net_worth_daily (workspace_id, date, net_worth) VALUES (?, ?, ?) ON CONFLICT(workspace_id, date) DO UPDATE SET net_worth = excluded.net_worth")
    .run(workspaceId, date, netWorth);
}

/** Hand-entered months before tracking, then daily totals (older per-asset snapshots fill days before those began). */
export function netWorthHistory(workspaceId: number): { date: string; netWorth: number; manual?: boolean }[] {
  const daily = getDb()
    .prepare("SELECT date, net_worth as netWorth FROM net_worth_daily WHERE workspace_id = ? ORDER BY date")
    .all(workspaceId) as { date: string; netWorth: number }[];
  const firstDaily = daily[0]?.date ?? "9999";
  const tracked = [...trackedHistory(workspaceId).filter((h) => h.date < firstDaily), ...daily];
  const first = tracked[0]?.date ?? "9999";
  const manual = (getDb()
    .prepare("SELECT date, net_worth as netWorth FROM net_worth_manual WHERE workspace_id = ? AND date < ? ORDER BY date")
    .all(workspaceId, first) as { date: string; netWorth: number }[]).map((m) => ({ ...m, manual: true }));
  return [...manual, ...tracked];
}

function trackedHistory(workspaceId: number): { date: string; netWorth: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT s.date, s.asset_id as assetId, s.value_ils as value, a.is_liability as isLiability
       FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
       WHERE a.workspace_id = ? ORDER BY s.date`
    )
    .all(workspaceId) as { date: string; assetId: number; value: number; isLiability: number }[];
  const latest = new Map<number, number>();
  const out: { date: string; netWorth: number }[] = [];
  for (const r of rows) {
    latest.set(r.assetId, r.isLiability ? -r.value : r.value);
    const total = [...latest.values()].reduce((s, v) => s + v, 0);
    if (out.at(-1)?.date === r.date) out[out.length - 1].netWorth = total;
    else out.push({ date: r.date, netWorth: total });
  }
  return out;
}

export function saveAccountBalances(
  workspaceId: number,
  provider: string,
  accounts: { accountNumber: string; balance?: number; transactions?: { date: string; chargedAmount: number; status: string }[] }[],
  /** First day the scrape fetched (YYYY-MM-DD); without it the balance isn't checked. */
  windowStart = "9999-12-31"
) {
  const db = getDb();
  const prevStmt = db.prepare("SELECT balance, drift, updated_at as updatedAt FROM account_balances WHERE workspace_id = ? AND provider = ? AND account_number = ?");
  const stmt = db.prepare(
    `INSERT INTO account_balances (workspace_id, provider, account_number, balance, drift, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, provider, account_number) DO UPDATE SET balance = excluded.balance, drift = excluded.drift, updated_at = excluded.updated_at`
  );
  const today = israelDay(new Date().toISOString());
  db.transaction(() => {
    for (const a of accounts) {
      if (a.balance == null) continue;
      const prev = prevStmt.get(workspaceId, provider, a.accountNumber) as { balance: number; drift: number | null; updatedAt: string } | undefined;
      const prevDay = prev ? israelDay(`${prev.updatedAt.replace(" ", "T")}Z`) : "";
      const checked = balanceDrift(
        prev ? { balance: prev.balance, day: prevDay } : null,
        a.balance,
        (a.transactions ?? []).map((t) => ({ day: israelDay(t.date), amount: t.chargedAmount, status: t.status })),
        today,
        windowStart
      );
      // A second sync the same day can't re-check (no clean day boundary), so it keeps the day's finding.
      const drift = checked ?? (prevDay === today ? prev?.drift ?? null : null);
      stmt.run(workspaceId, provider, a.accountNumber, a.balance, drift);
    }
  })();
}

export function listAccountBalances(workspaceId: number) {
  return getDb()
    .prepare(
      `SELECT rowid as id, provider, account_number as accountNumber, balance, drift, updated_at as updatedAt
       FROM account_balances WHERE workspace_id = ? ORDER BY provider, account_number`
    )
    .all(workspaceId) as { id: number; provider: string; accountNumber: string; balance: number; drift: number | null; updatedAt: string }[];
}

/** Per-asset daily values, oldest first. */
export function assetSnapshots(workspaceId: number): Map<number, { date: string; valueIls: number }[]> {
  const rows = getDb()
    .prepare(
      `SELECT s.asset_id as assetId, s.date, s.value_ils as valueIls FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
       WHERE a.workspace_id = ? ORDER BY s.date`
    )
    .all(workspaceId) as { assetId: number; date: string; valueIls: number }[];
  const out = new Map<number, { date: string; valueIls: number }[]>();
  for (const r of rows) {
    const list = out.get(r.assetId);
    if (list) list.push({ date: r.date, valueIls: r.valueIls });
    else out.set(r.assetId, [{ date: r.date, valueIls: r.valueIls }]);
  }
  return out;
}
