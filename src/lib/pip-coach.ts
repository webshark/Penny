/**
 * Pip as a financial coach: what the numbers of the month actually say, ranked. Pure, so the rules are testable
 * and the same on every screen; the sheet only renders the lines and the one piece of advice.
 */

export type PipTone = "act" | "watch" | "good";
export type PipWeakest = "emergency" | "savings" | "stability" | "debt" | "buffer";

export interface PipInsight {
  /** Translation key under pet.coach. */
  key: string;
  tone: PipTone;
  vars?: Record<string, number | string>;
}

export interface PipInput {
  /** Home's month card: spent against the budget, and how much of the month is gone (0–1). */
  month?: { spent: number; budget: number; elapsed: number } | null;
  /** This calendar month against the one before, plus its savings rate and uncategorised count. */
  flow?: { income: number; expenses: number; previousExpenses: number; savingsRate: number | null; uncategorized: number } | null;
  /** The category that moved the most against last month. */
  mover?: { name: string; spent: number; previous: number } | null;
  /** Emergency fund in months of spending, and the household's target. */
  runway?: { months: number; target: number } | null;
  /** Bank and the card bills falling before payday. */
  cash?: { safeToSpend: number | null; billsDue: number; daysLeft: number; bank: number | null } | null;
  /** Open installment plans and this month's unusual charges. */
  debts?: { installments: number; anomalies: number } | null;
  /** The next card charge the forecast expects, and how many days away it is. */
  nextBill?: { amount: number; days: number } | null;
  /** Amounts, already formatted by the caller. */
  fmt: (n: number) => string;
}

const pct = (n: number) => Math.round(n * 100);
const dec = (n: number) => Math.round(n * 10) / 10;

/** What Pip would say, most urgent first: money going wrong, then what is going right. */
export function pipInsights(i: PipInput): PipInsight[] {
  const out: PipInsight[] = [];
  const m = i.month, flow = i.flow, cash = i.cash;
  if (cash?.bank != null && cash.bank < 0) {
    out.push({ key: "bankNegative", tone: "act", vars: { amount: i.fmt(Math.abs(cash.bank)) } });
  }
  if (cash?.safeToSpend != null && cash.billsDue > Math.max(0, cash.safeToSpend)) {
    out.push({ key: "billsOverSafe", tone: "act", vars: { bills: i.fmt(cash.billsDue), safe: i.fmt(Math.max(0, cash.safeToSpend)) } });
  }
  if (m && m.budget > 0) {
    const used = m.spent / m.budget;
    const over = used - m.elapsed;
    out.push(over > 0.1
      ? { key: "paceOver", tone: "watch", vars: { used: pct(used), elapsed: pct(m.elapsed) } }
      : { key: "paceOn", tone: "good", vars: { used: pct(used), elapsed: pct(m.elapsed) } });
  }
  if (i.mover && i.mover.previous > 0) {
    const delta = i.mover.spent - i.mover.previous;
    const noise = Math.max(50, i.mover.previous * 0.2);
    if (delta > noise) out.push({ key: "moverUp", tone: "watch", vars: { name: i.mover.name, amount: i.fmt(delta) } });
    else if (delta < -noise) out.push({ key: "moverDown", tone: "good", vars: { name: i.mover.name, amount: i.fmt(-delta) } });
  }
  if (flow?.savingsRate != null) {
    const p = pct(flow.savingsRate);
    out.push(flow.savingsRate >= 0.2
      ? { key: "savingGood", tone: "good", vars: { pct: p } }
      : { key: "savingLow", tone: "watch", vars: { pct: p } });
  }
  if (i.runway && i.runway.target > 0) {
    out.push(i.runway.months >= i.runway.target
      ? { key: "runwayFull", tone: "good", vars: { months: dec(i.runway.months) } }
      : { key: "runwayShort", tone: "watch", vars: { months: dec(i.runway.months), target: i.runway.target } });
  }
  if (cash?.safeToSpend != null && cash.safeToSpend >= 0 && cash.daysLeft > 0) {
    out.push({ key: "freeUntilPayday", tone: "good", vars: { amount: i.fmt(cash.safeToSpend), days: cash.daysLeft } });
  }
  if (i.debts?.installments) {
    out.push({ key: "installments", tone: "watch", vars: { amount: i.fmt(i.debts.installments) } });
  }
  if (i.debts?.anomalies) {
    out.push({ key: "anomalies", tone: "watch", vars: { count: i.debts.anomalies } });
  }
  if (i.nextBill && i.nextBill.amount > 0) {
    out.push({ key: "nextBill", tone: "good", vars: { amount: i.fmt(i.nextBill.amount), days: Math.max(0, Math.round(i.nextBill.days)) } });
  }
  if (flow?.uncategorized) {
    out.push({ key: "uncategorized", tone: "watch", vars: { amount: i.fmt(flow.uncategorized) } });
  }
  // A short list gets read: everything that needs action first, then the watches, then the good news.
  const rank: Record<PipTone, number> = { act: 0, watch: 1, good: 2 };
  return out.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.tone] - rank[b.x.tone] || a.i - b.i).map((e) => e.x);
}

/** The one thing worth fixing first, said as advice rather than a number. */
export function pipGuru(weakest: PipWeakest | null | undefined, i: PipInput): PipInsight {
  const flow = i.flow;
  switch (weakest) {
    case "emergency": {
      const gap = i.runway ? dec(i.runway.target - i.runway.months) : 0;
      // Already at the target: the score still ranks it lowest, but there is nothing to top up.
      return gap > 0
        ? { key: "guru_emergency", tone: "watch", vars: { months: gap, target: i.runway?.target ?? 0 } }
        : { key: "guru_steady", tone: "good" };
    }
    case "savings": {
      const perYear = flow && flow.income > 0 ? flow.income * 0.01 * 12 : 0;
      return { key: "guru_savings", tone: "watch", vars: { amount: i.fmt(perYear) } };
    }
    case "debt":
      return { key: "guru_debt", tone: "act" };
    case "buffer":
      return { key: "guru_buffer", tone: "act" };
    case "stability":
      return { key: "guru_stability", tone: "watch" };
    default:
      return { key: "guru_steady", tone: "good" };
  }
}
