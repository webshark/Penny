import "server-only";

import { ownerClause } from "@/server/lib/owner-scope";
import { getDb } from "../db";
import type { FlowType } from "@/lib/flows";

/**
 * The one place reports read money from. Both views already settle the rules that used to be
 * repeated in every query: completed only, excluded rows out, business share applied, refunds
 * counted as negative spending, internal transfers neutral. Change a rule here, once.
 */

export interface CashTotals {
  income: number;
  /** Spending net of refunds. Positive means money went out. */
  spend: number;
  net: number;
}

export function cashBetween(workspaceId: number, from: string, to: string): CashTotals {
  const o = ownerClause("", { viaTransaction: true });
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN flow_type = 'income' THEN cash_amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN flow_type <> 'income' THEN -cash_amount END), 0) AS spend
       FROM v_cash_rows
       WHERE workspace_id = ? AND date >= ? AND date <= ?${o.sql}`
    )
    .get(workspaceId, from, to, ...o.params) as { income: number; spend: number };
  return { income: row.income, spend: row.spend, net: row.income - row.spend };
}

export function spendBetween(workspaceId: number, from: string, to: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(spend), 0) AS total FROM v_spend_rows
       WHERE workspace_id = ? AND date >= ? AND date <= ?`
    )
    .get(workspaceId, from, to) as { total: number };
  return row.total;
}

export function incomeBetween(workspaceId: number, from: string, to: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cash_amount), 0) AS total FROM v_cash_rows
       WHERE workspace_id = ? AND flow_type = 'income' AND date >= ? AND date <= ?`
    )
    .get(workspaceId, from, to) as { total: number };
  return row.total;
}

export function spendByCategory(
  workspaceId: number,
  from: string,
  to: string
): { categoryId: number; amount: number }[] {
  return getDb()
    .prepare(
      `SELECT category_id AS categoryId, SUM(spend) AS amount
       FROM v_spend_rows
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(workspaceId, from, to) as { categoryId: number; amount: number }[];
}

export interface FlowTotal {
  flowType: FlowType;
  count: number;
  total: number;
}

/** Every row grouped by what it does. The parts must add up to the whole; the tests enforce it. */
export function flowTotals(workspaceId: number): FlowTotal[] {
  return getDb()
    .prepare(
      `SELECT flow_type AS flowType, COUNT(*) AS count, COALESCE(SUM(charged_amount), 0) AS total
       FROM transactions WHERE workspace_id = ? GROUP BY flow_type ORDER BY flow_type`
    )
    .all(workspaceId) as FlowTotal[];
}

/** Sum of every stored amount, the other side of the flowTotals invariant. */
export function transactionsTotal(workspaceId: number): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(charged_amount), 0) AS total FROM transactions WHERE workspace_id = ?`)
    .get(workspaceId) as { total: number };
  return row.total;
}
