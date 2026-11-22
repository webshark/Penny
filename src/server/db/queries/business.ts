import "server-only";

import { getDb } from "../index";
import { roundCents } from "@/lib/money";

/** The business share of counted transactions: charged_amount - personal_amount, by month and category. */
export interface BusinessMonth {
  month: string;
  expenses: number;
  income: number;
  net: number;
}

export interface BusinessCategory {
  categoryId: number;
  name: string;
  color: string | null;
  expenses: number;
  count: number;
}

export interface BusinessMerchant {
  merchant: string;
  expenses: number;
  count: number;
}

export interface BusinessRow {
  date: string;
  description: string;
  account: string;
  category: string;
  charged: number;
  business: number;
  pct: number;
}

export interface BusinessReport {
  from: string;
  to: string;
  expenses: number;
  income: number;
  net: number;
  businessTransactions: number;
  months: BusinessMonth[];
  categories: BusinessCategory[];
  merchants: BusinessMerchant[];
  rows: BusinessRow[];
}

// Only rows where a business share was set: charged_amount differs from the household amount.
const BASE = `FROM category_transactions t LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.workspace_id = ? AND t.date >= ? AND t.date <= ? AND t.status = 'completed' AND t.is_excluded = 0
    AND t.charged_amount != t.personal_amount`;

const EXPENSE_SHARE = "SUM(CASE WHEN t.kind = 'expense' THEN -(t.charged_amount - t.personal_amount) ELSE 0 END)";
const INCOME_SHARE = "SUM(CASE WHEN t.kind = 'income' THEN t.charged_amount - t.personal_amount ELSE 0 END)";

/** The business side of the ledger for a period, so business spending has a report behind the field. */
export function getBusinessReport(workspaceId: number, from: string, to: string): BusinessReport {
  const db = getDb();
  const totals = db
    .prepare(`SELECT ${EXPENSE_SHARE} AS expenses, ${INCOME_SHARE} AS income, COUNT(DISTINCT t.id) AS businessTransactions ${BASE}`)
    .get(workspaceId, from, to) as { expenses: number; income: number; businessTransactions: number };

  const months = db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS month, ${EXPENSE_SHARE} AS expenses, ${INCOME_SHARE} AS income ${BASE}
       GROUP BY month ORDER BY month ASC`,
    )
    .all(workspaceId, from, to) as { month: string; expenses: number; income: number }[];

  const categories = db
    .prepare(
      `SELECT COALESCE(t.category_id, 0) AS categoryId, COALESCE(c.name, '') AS name, c.color AS color,
              ${EXPENSE_SHARE} AS expenses, COUNT(DISTINCT t.id) AS count ${BASE}
       GROUP BY t.category_id ORDER BY expenses DESC`,
    )
    .all(workspaceId, from, to) as BusinessCategory[];

  const merchants = db
    .prepare(
      `SELECT t.description AS merchant, ${EXPENSE_SHARE} AS expenses, COUNT(DISTINCT t.id) AS count ${BASE}
       AND t.kind = 'expense' GROUP BY t.description ORDER BY expenses DESC LIMIT 10`,
    )
    .all(workspaceId, from, to) as BusinessMerchant[];

  const rows = db
    .prepare(
      `SELECT substr(t.date, 1, 10) AS date, t.description, t.account_number AS account, COALESCE(c.name, '') AS category,
              t.charged_amount AS charged, ROUND(t.charged_amount - t.personal_amount, 2) AS business
       ${BASE}
       ORDER BY t.date DESC, t.id DESC LIMIT 5000`,
    )
    .all(workspaceId, from, to) as (Omit<BusinessRow, "pct">)[];

  return {
    from,
    to,
    expenses: roundCents(totals.expenses),
    income: roundCents(totals.income),
    net: roundCents(totals.income - totals.expenses),
    businessTransactions: totals.businessTransactions,
    months: months.map((m) => ({
      month: m.month,
      expenses: roundCents(m.expenses),
      income: roundCents(m.income),
      net: roundCents(m.income - m.expenses),
    })),
    categories: categories.map((c) => ({ ...c, expenses: roundCents(c.expenses) })),
    merchants: merchants.map((m) => ({ ...m, expenses: roundCents(m.expenses) })),
    rows: rows.map((r) => ({
      ...r,
      charged: roundCents(r.charged),
      business: roundCents(r.business),
      pct: r.charged === 0 ? 0 : Math.round((r.business / r.charged) * 100),
    })),
  };
}
