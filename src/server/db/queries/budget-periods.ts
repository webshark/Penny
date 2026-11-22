import "server-only";

import { getDb } from "../index";
import { getBudgetMoves } from "./budgets";
import { spendByCategory } from "../../finance/facts";
import { addDays } from "@/server/lib/date-utils";
import {
  budgetMonthByKey,
  budgetMonthRange,
  carryAmount,
  effectiveBudget,
  isRolloverRule,
  shiftBudgetMonthKey,
  type BudgetHistoryView,
  type BudgetLineView,
  type BudgetMonth,
  type BudgetPeriodView,
  type RolloverRule,
} from "@/lib/finance-period";

/**
 * Budget v2. `budgets` holds each category's default amount and roll-over rule. Every period gets
 * its own `budget_lines` row with that base, the carry-in from the previous period and any moves,
 * so editing this month never rewrites history and an unused balance can follow the household's
 * own month boundary.
 */

interface LineRow {
  categoryId: number;
  name: string;
  base: number;
  carryIn: number;
  moves: number;
  rollover: RolloverRule;
}

function periodExists(workspaceId: number, key: string): boolean {
  return (
    getDb()
      .prepare("SELECT 1 FROM budget_periods WHERE workspace_id = ? AND period = ?")
      .get(workspaceId, key) !== undefined
  );
}

function lineRows(workspaceId: number, key: string): LineRow[] {
  return getDb()
    .prepare(
      `SELECT l.category_id AS categoryId, COALESCE(c.name, '') AS name,
              l.base_amount AS base, l.carry_in AS carryIn, l.moves,
              COALESCE(b.rollover_rule, 'none') AS rollover
       FROM budget_lines l
       LEFT JOIN categories c ON c.id = l.category_id AND c.workspace_id = l.workspace_id
       LEFT JOIN budgets b ON b.workspace_id = l.workspace_id AND b.category_id = l.category_id
       WHERE l.workspace_id = ? AND l.period = ?`
    )
    .all(workspaceId, key) as LineRow[];
}

function defaults(workspaceId: number): Map<number, { amount: number; rule: RolloverRule }> {
  const rows = getDb()
    .prepare(
      `SELECT category_id AS categoryId, monthly_amount AS amount,
              COALESCE(rollover_rule, 'none') AS rule
       FROM budgets WHERE workspace_id = ?`
    )
    .all(workspaceId) as { categoryId: number; amount: number; rule: string }[];
  return new Map(rows.map((r) => [r.categoryId, { amount: r.amount, rule: isRolloverRule(r.rule) ? r.rule : "none" }]));
}

/**
 * Copies this period's one-month moves ("move from X") into its lines, so base, carry-in and moves
 * are read from one place and the dashboard, history and recap all show the same planned total.
 * Idempotent: removes moves that were undone and leaves untouched lines alone.
 */
function syncMoves(workspaceId: number, key: string): void {
  const delta = new Map<number, number>();
  for (const move of getBudgetMoves(workspaceId)[key] ?? []) {
    delta.set(move.from, (delta.get(move.from) ?? 0) - move.amount);
    delta.set(move.to, (delta.get(move.to) ?? 0) + move.amount);
  }
  const db = getDb();
  const rows = db
    .prepare("SELECT category_id AS categoryId, moves FROM budget_lines WHERE workspace_id = ? AND period = ?")
    .all(workspaceId, key) as { categoryId: number; moves: number }[];
  const update = db.prepare(
    "UPDATE budget_lines SET moves = ?, updated_at = datetime('now') WHERE workspace_id = ? AND period = ? AND category_id = ?"
  );
  const insert = db.prepare(
    "INSERT INTO budget_lines (workspace_id, period, category_id, base_amount, carry_in, moves) VALUES (?, ?, ?, 0, 0, ?)"
  );
  const exists = db.prepare("SELECT 1 FROM categories WHERE workspace_id = ? AND id = ?");
  db.transaction(() => {
    for (const row of rows) {
      const next = Math.round((delta.get(row.categoryId) ?? 0) * 100) / 100;
      if (Math.abs(next - row.moves) > 0.001) update.run(next, workspaceId, key, row.categoryId);
      delta.delete(row.categoryId);
    }
    for (const [categoryId, amount] of delta) {
      if (amount && exists.get(workspaceId, categoryId)) insert.run(workspaceId, key, categoryId, amount);
    }
  })();
}

/**
 * Creates the period and its lines once, carrying the previous period's leftover in. Idempotent and
 * safe to call on every read; a deleted category simply has no line.
 */
export function ensureBudgetPeriod(workspaceId: number, range: BudgetMonth, startDay: number): void {
  if (periodExists(workspaceId, range.key)) return;
  const db = getDb();
  const previous = budgetMonthRange(startDay, addDays(range.from, -1));
  // The previous period's leftover includes its moves, so read them from the same setting first.
  syncMoves(workspaceId, previous.key);
  const prevLines = new Map(lineRows(workspaceId, previous.key).map((l) => [l.categoryId, l]));
  const prevSpent = new Map(spendByCategory(workspaceId, previous.from, previous.to).map((r) => [r.categoryId, r.amount]));
  const now = defaults(workspaceId);

  const ids = new Set<number>([...prevLines.keys(), ...now.keys()]);
  const lines: (LineRow & { base: number; carryIn: number })[] = [];
  for (const categoryId of ids) {
    const prev = prevLines.get(categoryId);
    const setting = now.get(categoryId);
    const base = setting?.amount ?? 0;
    const previousBase = prev ? prev.base + prev.carryIn + prev.moves : base;
    const leftover = previousBase - (prevSpent.get(categoryId) ?? 0);
    const rule = setting?.rule ?? prev?.rollover ?? "none";
    lines.push({ categoryId, name: "", base, carryIn: carryAmount(rule, leftover, base || previousBase), moves: 0, rollover: rule });
  }

  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO budget_periods (workspace_id, period, start_day, from_date, to_date)
       VALUES (?, ?, ?, ?, ?)`
    ).run(workspaceId, range.key, startDay, range.from, range.to);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO budget_lines (workspace_id, period, category_id, base_amount, carry_in, moves)
       VALUES (?, ?, ?, ?, ?, 0)`
    );
    for (const line of lines) insert.run(workspaceId, range.key, line.categoryId, line.base, line.carryIn);
  })();
}

export function getPeriodBudget(
  workspaceId: number,
  range: BudgetMonth,
  startDay: number
): { lines: BudgetLineView[]; view: BudgetPeriodView } {
  ensureBudgetPeriod(workspaceId, range, startDay);
  syncMoves(workspaceId, range.key);
  const rows = lineRows(workspaceId, range.key);
  const spent = spendByCategory(workspaceId, range.from, range.to).reduce((s, r) => s + r.amount, 0);
  const lines = rows.map((r) => ({ ...r, budget: effectiveBudget(r.base, r.carryIn, r.moves) }));
  const planned = lines.reduce((s, l) => s + l.budget, 0);
  return {
    lines,
    view: { period: range, startDay, planned, spent, leftover: Math.round((planned - spent) * 100) / 100 },
  };
}

/** Effective budget per category, for the month containing `from`. */
export function getEffectiveBudgets(
  workspaceId: number,
  range: BudgetMonth,
  startDay: number
): Map<number, BudgetLineView> {
  return new Map(getPeriodBudget(workspaceId, range, startDay).lines.map((l) => [l.categoryId, l]));
}

/**
 * Sets this period's base and the default future periods inherit. History stays as it was.
 * Returns false when the category does not belong to the workspace.
 */
export function setBudgetForPeriod(
  workspaceId: number,
  range: BudgetMonth,
  startDay: number,
  categoryId: number,
  amount: number
): boolean {
  const db = getDb();
  const exists = db
    .prepare("SELECT 1 FROM categories WHERE workspace_id = ? AND id = ?")
    .get(workspaceId, categoryId);
  if (!exists) return false;
  ensureBudgetPeriod(workspaceId, range, startDay);
  return db.transaction(() => {
    if (amount <= 0) {
      db.prepare("DELETE FROM budgets WHERE workspace_id = ? AND category_id = ?").run(workspaceId, categoryId);
    } else {
      db.prepare(
        `INSERT INTO budgets (workspace_id, category_id, monthly_amount, is_auto, rollover_rule, updated_at)
         VALUES (?, ?, ?, 0, COALESCE((SELECT rollover_rule FROM budgets WHERE workspace_id = ? AND category_id = ?), 'none'), datetime('now'))
         ON CONFLICT(workspace_id, category_id) DO UPDATE SET
           monthly_amount = excluded.monthly_amount, is_auto = 0, updated_at = excluded.updated_at`
      ).run(workspaceId, categoryId, amount, workspaceId, categoryId);
    }
    // Removing a budget removes what it had carried in too; the line stays as history.
    const carry = amount <= 0 ? 0 : null;
    db.prepare(
      `INSERT INTO budget_lines (workspace_id, period, category_id, base_amount, carry_in, moves)
       VALUES (?, ?, ?, ?, 0, 0)
       ON CONFLICT(workspace_id, period, category_id) DO UPDATE SET
         base_amount = excluded.base_amount,
         carry_in = COALESCE(?, carry_in),
         updated_at = datetime('now')`
    ).run(workspaceId, range.key, categoryId, Math.max(0, amount), carry);
    return true;
  })();
}

export function setRolloverRule(workspaceId: number, categoryId: number, rule: RolloverRule): boolean {
  return (
    getDb()
      .prepare("UPDATE budgets SET rollover_rule = ?, updated_at = datetime('now') WHERE workspace_id = ? AND category_id = ?")
      .run(rule, workspaceId, categoryId).changes > 0
  );
}

/** The last `months` periods, newest first, each with what was planned and what was spent. */
export function budgetHistory(
  workspaceId: number,
  startDay: number,
  today: string,
  months = 6
): BudgetHistoryView[] {
  const out: BudgetHistoryView[] = [];
  const db = getDb();
  const status = db.prepare("SELECT status FROM budget_periods WHERE workspace_id = ? AND period = ?");
  for (let i = 0; i < months; i++) {
    const range = budgetMonthRange(startDay, today, -i);
    ensureBudgetPeriod(workspaceId, range, startDay);
    syncMoves(workspaceId, range.key);
    const lines = lineRows(workspaceId, range.key);
    const planned = lines.reduce((s, l) => s + effectiveBudget(l.base, l.carryIn, l.moves), 0);
    const spent = spendByCategory(workspaceId, range.from, range.to).reduce((s, r) => s + r.amount, 0);
    const row = status.get(workspaceId, range.key) as { status: string } | undefined;
    const closed = row?.status === "closed";
    out.push({
      period: range,
      startDay,
      planned: Math.round(planned * 100) / 100,
      spent: Math.round(spent * 100) / 100,
      leftover: Math.round((planned - spent) * 100) / 100,
      carryIn: Math.round(lines.reduce((s, l) => s + l.carryIn, 0) * 100) / 100,
      closed,
    });
  }
  return out;
}

/** Marks the period closed so it is clearly history. The lines and totals stay untouched. */
export function closeBudgetPeriod(workspaceId: number, range: BudgetMonth, startDay: number): void {
  ensureBudgetPeriod(workspaceId, range, startDay);
  getDb()
    .prepare("UPDATE budget_periods SET status = 'closed', closed_at = datetime('now') WHERE workspace_id = ? AND period = ?")
    .run(workspaceId, range.key);
}

export { budgetMonthByKey, budgetMonthRange, shiftBudgetMonthKey };
