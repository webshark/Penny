import type { Budget, Category, OverviewPayload, TransactionWithCategory } from "@/lib/types";

/** The cash-flow month `offset` months back that starts on `startDay` (1 = calendar month). */
export function cashflowMonth(startDay: number, offset: number, today = new Date()) {
  const d = Math.min(28, Math.max(1, startDay || 1));
  const back = (today.getDate() < d ? 1 : 0) + offset;
  const from = new Date(today.getFullYear(), today.getMonth() - back, d);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, d - 1);
  return { from, to };
}

/**
 * Tracked categories as rows: every one the user picked (₪0 ones too, never dropped), biggest spend first,
 * then biggest expectation. The first `top` get their own row; the rest go under one "more" row.
 */
export function trackedRows<T extends { spent: number; expected: number }>(tracked: T[], top = 6) {
  const sorted = [...tracked].sort((a, b) => b.spent - a.spent || b.expected - a.expected);
  // Never fold a single leftover: "1 more category" is no shorter than the row itself.
  const cut = sorted.length > top + 1 ? top : sorted.length;
  return { shown: sorted.slice(0, cut), rest: sorted.slice(cut) };
}

export interface Item { id: number; date: string; description: string; amount: number }
interface Line { spent: number; expected: number; items: Item[] }

const item = (t: TransactionWithCategory, amount = t.chargedAmount): Item => ({ id: t.id, date: t.date, description: t.description, amount });
const line = (): Line => ({ spent: 0, expected: 0, items: [] });

/**
 * The month as Simple mode shows it, split into cash-flow lines.
 * Expected amounts are the category budget, else what the full previous month spent; expected income is the full
 * previous month's income. `previousMonth` must be the whole previous month (not "same days so far").
 * A refund (money in on an expense category) lowers that category's spend instead of counting as income.
 * Split transactions are charged to each part's category.
 * shortcut: income is "fixed" only when its category's costType is fixed. Upgrade when recurring income detection exists.
 */
export function buildCashflow(
  txns: TransactionWithCategory[],
  categories: Category[],
  budgets: Budget[],
  previousMonth: OverviewPayload,
  /** First and last day of the cash-flow month (it can start on payday). */
  range: { from: Date; to: Date },
  today = new Date(),
) {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const budget = new Map(budgets.map((b) => [b.categoryId, b.monthlyAmount]));
  const previous = new Map(previousMonth.categories.map((c) => [c.categoryId, c.spent]));
  // A budget of 0 is a real choice; only a missing budget falls back to last month.
  const expectedOf = (id: number) => (budget.has(id) ? budget.get(id)! : previous.get(id) ?? 0);
  // Parents roll up their children, so only leaves carry an expectation (no double counting).
  const parents = new Set(categories.map((c) => c.parentId).filter((p): p is number => p != null));

  const variable = line(), fixed = line(), savings = line();
  const tracked = new Map<number, Line & { id: number; name: string; color: string }>();
  const income = { received: 0, expected: previousMonth.totals.income, fixed: [] as Item[], variable: [] as Item[] };
  const off = { income: [] as Item[], expenses: [] as Item[], incomeTotal: 0, expenseTotal: 0 };
  const seen = new Set<number>();

  // A row is always a parent category: a sub-category's spending rolls into the row above it, so the
  // list stays as short as the household's top-level budget.
  const rootOf = (c: Category): Category => {
    let cur = c;
    const walked = new Set<number>();
    while (cur.parentId != null && !walked.has(cur.id)) {
      walked.add(cur.id);
      const parent = cat.get(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  };

  const lineFor = (c: Category | undefined) => {
    if (!c) return variable;
    if (c.needType === "saving") return savings;
    if (c.costType === "fixed") return fixed;
    // Tracked when the category itself, or the parent it rolls into, is budgeted.
    let budgeted = c.budgetMode === "budgeted";
    for (let up = c.parentId != null ? cat.get(c.parentId) : undefined; up && !budgeted; up = up.parentId != null ? cat.get(up.parentId) : undefined) {
      budgeted = up.budgetMode === "budgeted";
    }
    if (budgeted) {
      const row = rootOf(c);
      if (!tracked.has(row.id)) tracked.set(row.id, { id: row.id, name: row.name, color: row.color, ...line() });
      return tracked.get(row.id)!;
    }
    return variable;
  };

  // Every expense leaf with an expectation gets its line, even with nothing spent yet.
  for (const c of categories) {
    if (c.kind !== "expense" || parents.has(c.id)) continue;
    const e = expectedOf(c.id);
    if (e > 0 || c.budgetMode === "budgeted") { lineFor(c).expected += e; seen.add(c.id); }
  }

  /** Books `amount` (negative = money out) of `t` on category `categoryId`. */
  const book = (t: TransactionWithCategory, categoryId: number | null, amount: number) => {
    const c = categoryId != null ? cat.get(categoryId) : undefined;
    if (amount > 0 && c?.kind !== "expense") {
      income.received += amount;
      (c?.costType === "fixed" ? income.fixed : income.variable).push(item(t, amount));
      return;
    }
    const l = lineFor(c);
    if (c && !seen.has(c.id) && !parents.has(c.id)) { l.expected += expectedOf(c.id); seen.add(c.id); }
    l.spent -= amount; // a refund (amount > 0) lowers spend
    l.items.push(item(t, amount));
  };

  for (const t of txns) {
    const a = t.chargedAmount;
    if (t.isExcluded || t.kind === "transfer") {
      if (a >= 0) { off.income.push(item(t)); off.incomeTotal += a; } else { off.expenses.push(item(t)); off.expenseTotal -= a; }
      continue;
    }
    if (t.allocations?.length) {
      const sign = a < 0 ? -1 : 1;
      for (const part of t.allocations) book(t, part.categoryId, sign * Math.abs(part.amount));
    } else {
      book(t, t.categoryId, a);
    }
  }

  const weeksOf = (l: Line) => splitWeeks(l, range, today);
  const weeks = weeksOf(variable);

  const expenseLines = [variable, fixed, savings, ...tracked.values()];
  const totalSpent = expenseLines.reduce((s, l) => s + l.spent, 0);
  const totalExpected = expenseLines.reduce((s, l) => s + Math.max(l.spent, l.expected), 0);
  const monthOver = range.to < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const forecast = monthOver
    ? income.received - totalSpent
    : Math.max(income.received, income.expected) - totalExpected;

  return {
    forecast,
    variable: { ...variable, left: variable.expected - variable.spent },
    weeks,
    tracked: [...tracked.values()].sort((a, b) => b.expected - a.expected).map((l) => ({ ...l, weeks: weeksOf(l) })),
    fixed,
    savings,
    totalSpent,
    totalExpected,
    income,
    off,
  };
}

export type Week = { from: Date; to: Date; spent: number; share: number; left: number; future: boolean; current: boolean };

/**
 * A line's month in weeks of 7 days from the month start (the last one may be shorter). Each week's share is what is
 * still left, spread by days over the rest of the month, so an expensive week shrinks the next ones. `left` < 0 is over.
 */
function splitWeeks(l: Line, range: { from: Date; to: Date }, today: Date): Week[] {
  const DAY = 86_400_000;
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const days = Math.round((range.to.getTime() - start.getTime()) / DAY) + 1;
  const count = Math.ceil(days / 7);
  // Day indexes by calendar date (not ms), so a DST change never shifts a day into the next week.
  const at = (i: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const weeks: Week[] = Array.from({ length: count }, (_, i) => ({
    from: at(i * 7), to: at(Math.min(days - 1, i * 7 + 6)), spent: 0, share: 0, left: 0,
    future: at(i * 7) > today, current: at(i * 7) <= today && today < at(Math.min(days, i * 7 + 7)),
  }));
  for (const x of l.items) {
    const d = Math.round((new Date(x.date.slice(0, 10) + "T00:00:00").getTime() - start.getTime()) / DAY);
    weeks[Math.min(count - 1, Math.max(0, Math.floor(d / 7)))].spent -= x.amount;
  }
  let before = 0;
  weeks.forEach((w, i) => {
    // By days, so a short last week gets a short week's share.
    const len = Math.min(7, days - i * 7);
    w.share = Math.max(0, ((l.expected - before) * len) / (days - i * 7));
    w.left = w.share - w.spent;
    // A week not over yet is assumed to use its share, so later weeks don't swell with money it may still spend.
    before += w.future || w.current ? Math.max(w.spent, w.share) : w.spent;
  });
  return weeks;
}
