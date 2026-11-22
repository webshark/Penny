import "server-only";

import { getDb } from "../index";
import { toLocalISODate } from "../../lib/date-utils";
import { getWorkspaceSetting, setWorkspaceSetting } from "./settings";
import { parseMoves, type BudgetMoves } from "@/lib/budget-moves";

export interface BudgetRow {
  categoryId: number;
  monthlyAmount: number;
  isAuto: boolean;
}

export function getAllBudgets(workspaceId: number): BudgetRow[] {
  const rows = getDb()
    .prepare(
      `SELECT category_id as categoryId, monthly_amount as monthlyAmount, is_auto as isAuto
       FROM budgets WHERE workspace_id = ?`
    )
    .all(workspaceId) as {
    categoryId: number;
    monthlyAmount: number;
    isAuto: number;
  }[];
  return rows.map((r) => ({
    categoryId: r.categoryId,
    monthlyAmount: r.monthlyAmount,
    isAuto: r.isAuto === 1,
  }));
}

export function getBudgetForCategory(
  workspaceId: number,
  categoryId: number
): BudgetRow | null {
  const row = getDb()
    .prepare(
      `SELECT category_id as categoryId, monthly_amount as monthlyAmount, is_auto as isAuto
       FROM budgets WHERE workspace_id = ? AND category_id = ?`
    )
    .get(workspaceId, categoryId) as
    | { categoryId: number; monthlyAmount: number; isAuto: number }
    | undefined;
  if (!row) return null;
  return {
    categoryId: row.categoryId,
    monthlyAmount: row.monthlyAmount,
    isAuto: row.isAuto === 1,
  };
}

export function setBudget(
  workspaceId: number,
  categoryId: number,
  amount: number,
  isAuto = false
): void {
  getDb()
    .prepare(
      `INSERT INTO budgets (workspace_id, category_id, monthly_amount, is_auto, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, category_id) DO UPDATE SET
         monthly_amount = excluded.monthly_amount,
         is_auto = excluded.is_auto,
         updated_at = excluded.updated_at`
    )
    .run(workspaceId, categoryId, amount, isAuto ? 1 : 0);
}

export function deleteBudget(workspaceId: number, categoryId: number): void {
  getDb()
    .prepare("DELETE FROM budgets WHERE workspace_id = ? AND category_id = ?")
    .run(workspaceId, categoryId);
}

interface AutoSpend {
  categoryId: number;
  amount: number;
}

/**
 * Auto-budget default: average monthly spend across the last N completed
 * calendar months (excluding the current month). Divides by months *available*,
 * so a fresh DB with one month of history returns that month's spend, not
 * one-third of it.
 */
export function getAutoBudgetAverage(
  workspaceId: number,
  monthsBack: number = 3
): AutoSpend[] {
  const now = new Date();
  const periods: { from: string; to: string }[] = [];
  for (let i = 1; i <= monthsBack; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    periods.push({
      from: toLocalISODate(start),
      to: toLocalISODate(end),
    });
  }

  const db = getDb();
  const totals = new Map<number, number>();
  const monthsSeen = new Map<number, number>();

  for (const { from, to } of periods) {
    const rows = db
      .prepare(
        `SELECT category_id as categoryId, SUM(spend) as amount
         FROM v_spend_rows
         WHERE workspace_id = ? AND date >= ? AND date <= ? AND category_id IS NOT NULL
         GROUP BY category_id`
      )
      .all(workspaceId, from, to) as AutoSpend[];

    for (const r of rows) {
      if (r.amount <= 0) continue;
      totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.amount);
      monthsSeen.set(r.categoryId, (monthsSeen.get(r.categoryId) ?? 0) + 1);
    }
  }

  const result: AutoSpend[] = [];
  for (const [categoryId, total] of totals) {
    const months = monthsSeen.get(categoryId) ?? 1;
    result.push({ categoryId, amount: total / months });
  }
  return result;
}

// One-month budget moves ("move from X"), kept as a JSON workspace setting.
export function getBudgetMoves(workspaceId: number): BudgetMoves {
  try {
    return parseMoves(JSON.parse(getWorkspaceSetting(workspaceId, "budget_moves") ?? "{}"));
  } catch {
    return {};
  }
}

export function setBudgetMoves(workspaceId: number, moves: BudgetMoves): void {
  setWorkspaceSetting(workspaceId, "budget_moves", JSON.stringify(moves));
}

/** Income of each of the last `months` complete months (0 for months with none), and this month so far. */
export function getMonthlyIncomes(workspaceId: number, months = 12, now = new Date()) {
  const from = toLocalISODate(new Date(now.getFullYear(), now.getMonth() - months, 1));
  const rows = getDb()
    .prepare(
      `SELECT substr(date, 1, 7) as month, SUM(cash_amount) as income FROM v_cash_rows
       WHERE workspace_id = ? AND flow_type = 'income' AND date >= ?
       GROUP BY month`
    )
    .all(workspaceId, from) as { month: string; income: number }[];
  const byMonth = new Map(rows.map((r) => [r.month, r.income]));
  const key = (d: Date) => toLocalISODate(d).slice(0, 7);
  const past: number[] = [];
  for (let i = months; i >= 1; i--) past.push(byMonth.get(key(new Date(now.getFullYear(), now.getMonth() - i, 1))) ?? 0);
  // Leading empty months are before the data starts, not weak months.
  while (past.length && past[0] === 0) past.shift();
  return { past, current: byMonth.get(key(now)) ?? 0 };
}
