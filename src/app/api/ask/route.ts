import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/server/db";
import { getPlan } from "@/server/db/queries/plan";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";
import { loadInsights } from "@/server/insights/data";
import { isActive } from "@/server/insights/recurring";
import { normalizeMerchant } from "@/server/rules/normalize";
import { askAI } from "@/server/ai/ask";
import { GET as cashAheadGET } from "../cash-ahead/route";
import { parseQuestion, periodLabel, type AskAnswer, type AskCategory } from "@/lib/ask";
import { budgetMonthRange } from "@/lib/finance-period";
import { shekels } from "@/lib/money";
import he from "@/i18n/messages/he.json";
import en from "@/i18n/messages/en.json";

export const dynamic = "force-dynamic";

const BASE = `t.workspace_id = ? AND t.status = 'completed' AND t.is_excluded = 0 AND t.date >= ? AND t.date <= ?`;
const day = (y: number, m: number, d: number) => new Intl.DateTimeFormat("en-CA").format(new Date(y, m, d));
const HE_CATS = he.categoriesSeeded as Record<string, string>;
const EN_CATS = en.categoriesSeeded as Record<string, string>;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 300) : "";
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  const ws = getWorkspaceIdFromRequest(request);
  const locale = await getLocale();
  const t = await getTranslations("ask");
  const tCat = (name: string) => (locale === "he" ? HE_CATS : EN_CATS)[name] ?? name;
  const money = (n: number) => shekels(n, locale);
  const db = getDb();
  const startDay = getPlan(ws).monthStartDay;
  const todayIso = israelToday();
  const today = new Date(`${todayIso}T12:00:00`);

  const catRows = db.prepare("SELECT id, name, parent_id as parentId FROM categories WHERE workspace_id = ?").all(ws) as { id: number; name: string; parentId: number | null }[];
  const categories: AskCategory[] = catRows.map((c) => ({ id: c.id, names: [c.name, HE_CATS[c.name] ?? c.name, EN_CATS[c.name] ?? c.name] }));
  const descriptions = (db.prepare("SELECT DISTINCT description FROM transactions WHERE workspace_id = ? LIMIT 5000").all(ws) as { description: string }[]).map((r) => r.description);
  const parsed = parseQuestion(question, today, categories, descriptions, startDay);
  const { from, to } = parsed.period;
  const range = [ws, from, `${to}T23:59:59`];
  const period = periodLabel(parsed.period, locale);
  const rowOf = (r: { date: string; description: string; amount: number }) => ({ date: r.date.slice(0, 10), label: r.description, amount: money(Math.abs(r.amount)) });
  const answer = (a: Omit<AskAnswer, "source">) => NextResponse.json({ source: "rules", ...a } satisfies AskAnswer);

  switch (parsed.intent) {
    case "spent":
    case "income":
    case "biggest": {
      const kind = parsed.intent === "income" ? "income" : "expense";
      let filter = "";
      const args: (string | number)[] = [...range];
      let name = "";
      if (parsed.categoryId != null) {
        filter = " AND (t.category_id = ? OR t.category_id IN (SELECT id FROM categories WHERE parent_id = ?))";
        args.push(parsed.categoryId, parsed.categoryId);
        name = tCat(catRows.find((c) => c.id === parsed.categoryId)!.name);
      } else if (parsed.merchant) {
        filter = " AND lower(t.description) LIKE ?";
        args.push(`%${parsed.merchant}%`);
        name = parsed.merchant;
      }
      const where = `${BASE} AND t.kind = '${kind}'${filter}`;
      const sum = db.prepare(`SELECT COALESCE(SUM(t.charged_amount), 0) as total, COUNT(*) as n FROM transactions t WHERE ${where}`).get(...args) as { total: number; n: number };
      const top = db
        .prepare(`SELECT t.date, t.description, t.charged_amount as amount FROM transactions t WHERE ${where} ORDER BY ABS(t.charged_amount) DESC LIMIT 5`)
        .all(...args) as { date: string; description: string; amount: number }[];
      const total = Math.abs(sum.total);
      const link = { href: "/transactions", label: t("linkTransactions") };
      if (parsed.intent === "biggest") {
        if (!top.length) return answer({ sentence: t("biggestNone", { period }), period, numbers: [], rows: [], link });
        return answer({
          sentence: t("biggest", { period, name: top[0].description, total: money(Math.abs(top[0].amount)) }),
          period,
          numbers: [{ label: t("nExpenses"), value: String(sum.n) }, { label: t("nTotal"), value: money(total) }],
          rows: top.map(rowOf),
          link,
        });
      }
      const key = parsed.intent === "income" ? "income" : name ? (parsed.categoryId != null ? "spentCat" : "spentMerchant") : "spentAll";
      return answer({
        sentence: t(key, { period, name, total: money(total) }),
        period,
        numbers: [
          { label: t("nTotal"), value: money(total) },
          { label: t("nCount"), value: String(sum.n) },
          ...(sum.n ? [{ label: t("nAverage"), value: money(total / sum.n) }] : []),
        ],
        rows: top.map(rowOf),
        link,
      });
    }

    case "untilPayday": {
      const c = (await (await cashAheadGET(request)).json()) as { safeToSpend: number; bank: number | null; billsDue: number; salaryExpected: number; until: string; daysLeft: number };
      const date = new Date(`${c.until}T12:00:00`).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", { day: "numeric", month: "long" });
      return answer({
        sentence: c.bank == null ? t("paydayNoBank", { date }) : t("payday", { total: money(c.safeToSpend), date, days: c.daysLeft }),
        numbers: [
          ...(c.bank == null ? [] : [{ label: t("nBank"), value: money(c.bank) }]),
          { label: t("nBills"), value: money(c.billsDue) },
          { label: t("nSalary"), value: money(c.salaryExpected) },
        ],
        rows: [],
        link: { href: "/", label: t("linkHome") },
      });
    }

    case "subscriptions": {
      const perMonth = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
      const subs = loadInsights(ws, todayIso)
        .series.filter((s) => s.status === "suggested" && isActive(s, todayIso)) // same list as the insights page
        .map((s) => ({ ...s, monthly: Math.abs(s.expectedAmount) * perMonth[s.cadence] }))
        .sort((a, b) => b.monthly - a.monthly);
      const monthly = subs.reduce((s, x) => s + x.monthly, 0);
      return answer({
        sentence: subs.length ? t("subs", { count: subs.length, total: money(monthly) }) : t("subsNone"),
        numbers: [{ label: t("nMonthly"), value: money(monthly) }, { label: t("nYearly"), value: money(monthly * 12) }],
        rows: subs.slice(0, 5).map((s) => ({ date: s.lastDate, label: s.merchant, amount: money(Math.abs(s.expectedAmount)) })),
        link: { href: "/insights", label: t("linkInsights") },
      });
    }

    case "savings": {
      // Without a named period: the last 6 complete household months, so a half-done month doesn't skew it.
      const p = parsed.period.explicit
        ? parsed.period
        : { from: budgetMonthRange(startDay, todayIso, -6).from, to: budgetMonthRange(startDay, todayIso, -1).to };
      const months = Math.max(1, (Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4))) * 12 + Number(p.to.slice(5, 7)) - Number(p.from.slice(5, 7)) + 1);
      const r = db
        .prepare(`SELECT COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.charged_amount END), 0) as income, COALESCE(-SUM(CASE WHEN t.kind = 'expense' THEN t.charged_amount END), 0) as spent FROM transactions t WHERE ${BASE}`)
        .get(ws, p.from, `${p.to}T23:59:59`) as { income: number; spent: number };
      const saved = (r.income - r.spent) / months;
      const label = periodLabel(p, locale);
      return answer({
        sentence: saved >= 0 ? t("savings", { total: money(saved), rate: r.income > 0 ? Math.round(((r.income - r.spent) / r.income) * 100) : 0 }) : t("savingsNegative", { total: money(-saved) }),
        period: label,
        numbers: [
          { label: t("nIncome"), value: money(r.income / months) },
          { label: t("nExpensesMonthly"), value: money(r.spent / months) },
          { label: t("nMonths"), value: String(months) },
        ],
        rows: [],
        link: { href: "/recap", label: t("linkRecap") },
      });
    }
  }

  // Unknown: optional AI over aggregated numbers only (no raw transaction rows leave the app).
  const examples = t.raw("examples") as string[];
  const yearAgo = day(today.getFullYear() - 1, today.getMonth() + 1, 1);
  const agg = [ws, yearAgo, `${todayIso}T23:59:59`];
  const byCategory = db
    .prepare(`SELECT substr(t.date, 1, 7) as month, COALESCE(p.name, c.name, 'Uncategorized') as category, ROUND(-SUM(t.charged_amount)) as total
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN categories p ON p.id = c.parent_id
      WHERE ${BASE} AND t.kind = 'expense' GROUP BY month, category ORDER BY month`)
    .all(...agg);
  const incomeByMonth = db.prepare(`SELECT substr(t.date, 1, 7) as month, ROUND(SUM(t.charged_amount)) as total FROM transactions t WHERE ${BASE} AND t.kind = 'income' GROUP BY month`).all(...agg);
  const merchantTotals = new Map<string, number>();
  for (const r of db.prepare(`SELECT t.description, t.charged_amount as amount FROM transactions t WHERE ${BASE} AND t.kind = 'expense'`).all(...agg) as { description: string; amount: number }[]) {
    const m = normalizeMerchant(r.description);
    merchantTotals.set(m, (merchantTotals.get(m) ?? 0) - r.amount);
  }
  const topMerchants = [...merchantTotals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([merchant, total]) => ({ merchant, total: Math.round(total) }));
  try {
    const text = await askAI(question, { today: todayIso, currency: "ILS", expensesByMonthAndCategory: byCategory, incomeByMonth, topMerchantsLast12Months: topMerchants });
    if (text) return NextResponse.json({ source: "ai", sentence: text, numbers: [], rows: [] } satisfies AskAnswer);
  } catch (e) {
    console.error("[ask] AI failed", e);
    return NextResponse.json({ source: "none", sentence: t("aiFailed"), numbers: [], rows: [], examples } satisfies AskAnswer);
  }
  return NextResponse.json({ source: "none", sentence: t("fallback"), numbers: [], rows: [], examples } satisfies AskAnswer);
}
