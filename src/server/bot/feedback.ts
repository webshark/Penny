import "server-only";

import { getDb } from "../db/index";
import { getEffectiveBudgets } from "../db/queries/budget-periods";
import { getPlan } from "../db/queries/plan";
import { budgetMonthRange } from "@/lib/finance-period";
import { computeCashAhead } from "../insights/cash-ahead";
import { freeLine, moneyFor } from "./snapshot";

interface NewSpend { amount: number; description: string; categoryId: number | null; category: string | null }

/**
 * The message sent right after a sync: the biggest new expenses, each with what is left in its
 * category budget, then the free-to-spend line. Null when the sync brought no new expense.
 */
export function spendFeedback(ws: number, since: string, today: string, hide = false): string | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ABS(t.charged_amount) as amount, t.description, t.category_id as categoryId, c.name as category
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.created_at >= ? AND t.kind = 'expense' AND t.is_excluded = 0
         AND t.status IN ('completed', 'pending')
       ORDER BY ABS(t.charged_amount) DESC`
    )
    .all(ws, since) as NewSpend[];
  if (rows.length === 0) return null;

  const money = moneyFor(hide);
  const cash = computeCashAhead(ws, today);
  // The same household month the budget screen uses, including any carry-in.
  const startDay = getPlan(ws).monthStartDay;
  const range = budgetMonthRange(startDay, today);
  const budgets = getEffectiveBudgets(ws, range, startDay);
  const spentIn = db.prepare(
    `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total FROM transactions
     WHERE workspace_id = ? AND category_id = ? AND kind = 'expense' AND is_excluded = 0
       AND status IN ('completed', 'pending') AND date >= ? AND date <= ?`
  );

  const lines = rows.slice(0, 3).map((r) => {
    const head = `• ${money(r.amount)} ${r.description}`;
    const budget = r.categoryId == null ? null : budgets.get(r.categoryId);
    if (!budget || budget.budget <= 0) return r.category ? `${head} (${r.category})` : head;
    const spent = (spentIn.get(ws, r.categoryId, range.from, `${range.to}T23:59:59`) as { total: number }).total;
    const left = budget.budget - spent;
    const ratio = spent / budget.budget;
    const dot = ratio >= 1 ? "🔴" : ratio >= 0.8 ? "🟡" : "🟢";
    return left < 0
      ? `${head}\n   ${dot} ${r.category}: חריגה של ${money(-left)} מהתקציב`
      : `${head}\n   ${dot} ${r.category}: נשארו ${money(left)} החודש`;
  });

  const more = rows.length > 3 ? `ועוד ${rows.length - 3} עסקאות חדשות.` : null;
  return [rows.length === 1 ? "💳 הוצאה חדשה" : `💳 ${rows.length} הוצאות חדשות`, ...lines, more, "", freeLine(cash, money)]
    .filter((l) => l !== null)
    .join("\n");
}
