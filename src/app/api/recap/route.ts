import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getAllBudgets } from "@/server/db/queries/budgets";
import { getPlan } from "@/server/db/queries/plan";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";
import { budgetMonthByKey, budgetMonthRange, shiftBudgetMonthKey } from "@/lib/finance-period";
import { monthRecap, yearRecap, type RecapCategory, type RecapExpense, type RecapRange } from "@/lib/recap";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");

// Month keys are household months: `month` picks the period starting in that calendar month, and
// the dates it covers follow the plan's monthStartDay.
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  const yearParam = params.get("year");
  const today = israelToday();
  if ((month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) || (yearParam && !/^\d{4}$/.test(yearParam))) {
    return NextResponse.json({ error: "invalid month or year" }, { status: 400 });
  }
  const startDay = getPlan(workspaceId).monthStartDay;
  // Nothing asked: the last complete household month.
  const target = month ?? shiftBudgetMonthKey(budgetMonthRange(startDay, today).key, -1);
  // Month mode looks back two years for the "under budget" run.
  const keys = yearParam
    ? Array.from({ length: 12 }, (_, i) => `${yearParam}-${pad(i + 1)}`)
    : Array.from({ length: 25 }, (_, i) => shiftBudgetMonthKey(target, i - 24));
  const periods: Record<string, RecapRange> = {};
  for (const key of keys) {
    const range = budgetMonthByKey(startDay, key);
    periods[key] = { from: range.from, to: range.to };
  }
  const from = periods[keys[0]].from;
  const to = periods[keys[keys.length - 1]].to;

  const db = getDb();
  const where = `t.workspace_id = ? AND t.date >= ? AND t.date <= ? AND t.status = 'completed' AND t.is_excluded = 0`;
  const expenses = db
    .prepare(
      `SELECT substr(t.date, 1, 10) as date, -t.charged_amount as amount, COALESCE(c.parent_id, c.id) as categoryId, t.description
       FROM category_transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where} AND t.kind = 'expense'`
    )
    .all(workspaceId, from, `${to}T23:59:59`) as RecapExpense[];
  const incomeRows = db
    .prepare(`SELECT substr(t.date, 1, 10) as date, t.charged_amount as amount FROM transactions t WHERE ${where} AND t.kind = 'income'`)
    .all(workspaceId, from, `${to}T23:59:59`) as { date: string; amount: number }[];
  // Income is bucketed by household month, not by the calendar month on the row.
  const income: Record<string, number> = {};
  for (const key of keys) {
    const range = periods[key];
    let total = 0;
    for (const row of incomeRows) if (row.date >= range.from && row.date <= range.to) total += row.amount;
    if (total) income[key] = total;
  }
  const categories = db
    .prepare("SELECT id, name, need_type as needType FROM categories WHERE workspace_id = ?")
    .all(workspaceId) as RecapCategory[];
  // Top-level budgets only, so parents and children don't count twice.
  const topLevel = new Set((db.prepare("SELECT id FROM categories WHERE workspace_id = ? AND parent_id IS NULL").all(workspaceId) as { id: number }[]).map((r) => r.id));
  const budgetTotal = getAllBudgets(workspaceId).filter((b) => topLevel.has(b.categoryId)).reduce((s, b) => s + b.monthlyAmount, 0);

  const input = { expenses, income, categories, budgetTotal, today, periods };
  return NextResponse.json(yearParam ? { mode: "year", recap: yearRecap(Number(yearParam), input) } : { mode: "month", recap: monthRecap(target, input) });
}
