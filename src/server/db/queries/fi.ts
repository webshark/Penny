import "server-only";

import { getDb } from "../index";
import { toLocalISODate } from "../../lib/date-utils";
import type { FiPayload } from "@/lib/types";

const BASE = `t.workspace_id = ? AND t.date >= ? AND t.date <= ?
  AND t.status = 'completed' AND t.is_excluded = 0`;

/** First and last day of the `count` complete months ending `endBack` months before this one. */
function window(today: Date, endBack: number, count: number) {
  const to = new Date(today.getFullYear(), today.getMonth() - endBack, 0);
  const from = new Date(today.getFullYear(), today.getMonth() - endBack - count, 1);
  return { from: toLocalISODate(from), to: toLocalISODate(to) };
}

export function getMonthlyAverages(workspaceId: number, today = new Date()) {
  const w = window(today, 0, 12);
  const rows = getDb()
    .prepare(
      `SELECT substr(t.date, 1, 7) as month,
         COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.personal_amount END), 0) as income,
         COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN -t.personal_amount END), 0) as expenses
       FROM transactions t WHERE ${BASE} GROUP BY month`
    )
    .all(workspaceId, w.from, w.to) as { income: number; expenses: number }[];
  const n = rows.length;
  return {
    monthsOfData: n,
    monthlyIncome: n ? rows.reduce((s, r) => s + r.income, 0) / n : 0,
    monthlyExpenses: n ? rows.reduce((s, r) => s + r.expenses, 0) / n : 0,
  };
}

/** Personal inflation: how each top-level category's spend changed year on year, weighted by this year's share. */
export function getPersonalInflation(workspaceId: number, today = new Date()): FiPayload["inflation"] {
  const db = getDb();
  const sum = (from: string, to: string) =>
    new Map(
      (db
        .prepare(
          `SELECT COALESCE(c.parent_id, c.id) as key, SUM(-t.personal_amount) as amount
           FROM category_transactions t JOIN categories c ON c.id = t.category_id
           WHERE ${BASE} AND t.kind = 'expense' GROUP BY key`
        )
        .all(workspaceId, from, to) as { key: number; amount: number }[]).map((r) => [r.key, r.amount])
    );
  const cur = window(today, 0, 12);
  const prev = window(today, 12, 12);
  const current = sum(cur.from, cur.to);
  const previous = sum(prev.from, prev.to);
  const cats = db
    .prepare("SELECT id, name, color FROM categories WHERE workspace_id = ? AND kind = 'expense'")
    .all(workspaceId) as { id: number; name: string; color: string }[];

  // Only categories with spend in both years can show a change.
  const both = cats.filter((c) => (current.get(c.id) ?? 0) > 0 && (previous.get(c.id) ?? 0) > 0);
  const total = both.reduce((s, c) => s + current.get(c.id)!, 0);
  const categories = both
    .map((c) => {
      const cv = current.get(c.id)!;
      const pv = previous.get(c.id)!;
      return { categoryId: c.id, name: c.name, color: c.color, previous: pv, current: cv, change: cv / pv - 1, weight: cv / total };
    })
    .sort((a, b) => b.weight - a.weight);
  return {
    rate: categories.length ? categories.reduce((s, c) => s + c.change * c.weight, 0) : null,
    categories,
  };
}
