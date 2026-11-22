import "server-only";

import { addMonths } from "../lib/date-utils";

export interface InstallmentTxn {
  merchant: string;
  account: string;
  /** Per-payment amount; sign is ignored. */
  amount: number;
  number: number;
  total: number;
  /** Billing date, YYYY-MM-DD. */
  date: string;
}

export interface ProjectedPayment {
  merchant: string;
  account: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month: string;
  amount: number;
  /** Which payment of the plan this is, e.g. 4 of 12. */
  number: number;
  total: number;
}

/**
 * Future payments of each installment plan, from its latest seen payment. Plans are keyed by account, merchant, total
 * and the month of their first payment (billing month minus the payments before it), which every payment of a plan
 * shares; not by amount, since issuers often bill the first payment an agora or two apart (333.34, 333.33).
 */
export function projectInstallments(txns: InstallmentTxn[], today: string): ProjectedPayment[] {
  const latest = new Map<string, InstallmentTxn>();
  for (const t of txns) {
    if (!(t.amount !== 0) || t.number < 1 || t.number > t.total) continue;
    const key = [t.account, t.merchant, t.total, addMonths(t.date, -(t.number - 1)).slice(0, 7)].join("|");
    const prev = latest.get(key);
    if (!prev || t.number > prev.number) latest.set(key, t);
  }

  const out: ProjectedPayment[] = [];
  for (const t of latest.values()) {
    for (let k = 1; k <= t.total - t.number; k++) {
      const date = addMonths(t.date, k);
      if (date < today) continue;
      out.push({ merchant: t.merchant, account: t.account, date, month: date.slice(0, 7), amount: Math.abs(t.amount), number: t.number + k, total: t.total });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface InstallmentPlan {
  merchant: string;
  account: string;
  amount: number;
  /** Payments already made, from the first one still ahead. */
  paid: number;
  total: number;
  remaining: number;
}

/** Open plans and what is still owed on them, plus the payments due in each of the next 12 months. */
export function openInstallments(payments: ProjectedPayment[], today: string) {
  const plans = new Map<string, InstallmentPlan>();
  const byMonth = new Map<string, number>();
  const horizon = addMonths(today, 12).slice(0, 7);
  for (const p of payments) {
    const key = [p.account, p.merchant, p.amount, p.total].join("|");
    const plan = plans.get(key) ?? { merchant: p.merchant, account: p.account, amount: p.amount, paid: p.number - 1, total: p.total, remaining: 0 };
    plan.paid = Math.min(plan.paid, p.number - 1);
    plan.remaining += p.amount;
    plans.set(key, plan);
    if (p.month < horizon) byMonth.set(p.month, (byMonth.get(p.month) ?? 0) + p.amount);
  }
  const list = [...plans.values()].sort((a, b) => b.remaining - a.remaining);
  return {
    total: list.reduce((s, p) => s + p.remaining, 0),
    months: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total })),
    plans: list,
  };
}
