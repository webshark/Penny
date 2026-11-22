/** Pure math behind the guided reviews: what repeats, what stopped, and how old the paperwork is. */

export type Cadence = "weekly" | "monthly" | "yearly";

export interface RecurringLike {
  merchant: string;
  cadence: Cadence;
  /** Signed as charged: a subscription is negative. */
  expectedAmount: number;
  /** YYYY-MM-DD of the latest charge. */
  lastDate: string;
  priceChange?: { from: number; to: number; date: string };
}

const PER_MONTH: Record<Cadence, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
const CYCLE_DAYS: Record<Cadence, number> = { weekly: 7, monthly: 30, yearly: 365 };
const DAY = 86_400_000;

/** What one recurring charge costs per month, whatever its cadence. */
export const monthlyCost = (s: Pick<RecurringLike, "cadence" | "expectedAmount">): number =>
  Math.abs(s.expectedAmount) * PER_MONTH[s.cadence];

/** Whole days from `from` to `to`; 0 when either is not a date. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY) : 0;
}

export interface SubscriptionAudit {
  count: number;
  monthly: number;
  yearly: number;
  biggest: { merchant: string; monthly: number } | null;
  /** Subscriptions that got more expensive. */
  raised: { merchant: string; from: number; to: number; date: string }[];
  /** Two cycles without a charge or more: probably cancelled, worth confirming. */
  dormant: { merchant: string; lastDate: string; monthly: number }[];
}

/** The recurring bill as one month, plus what went up and what looks cancelled already. */
export function auditSubscriptions(series: RecurringLike[], today: string): SubscriptionAudit {
  const active = series.filter((s) => monthlyCost(s) > 0);
  const monthly = active.reduce((sum, s) => sum + monthlyCost(s), 0);
  const biggest = [...active].sort((a, b) => monthlyCost(b) - monthlyCost(a))[0];

  const raised: SubscriptionAudit["raised"] = [];
  for (const s of active) {
    const change = s.priceChange;
    if (change && change.to > change.from) {
      raised.push({ merchant: s.merchant, from: change.from, to: change.to, date: change.date });
    }
  }

  return {
    count: active.length,
    monthly,
    yearly: monthly * 12,
    biggest: biggest ? { merchant: biggest.merchant, monthly: monthlyCost(biggest) } : null,
    raised: raised.sort((a, b) => b.to - b.from - (a.to - a.from)),
    dormant: active
      .filter((s) => daysBetween(s.lastDate, today) > CYCLE_DAYS[s.cadence] * 2)
      .map((s) => ({ merchant: s.merchant, lastDate: s.lastDate, monthly: monthlyCost(s) }))
      .sort((a, b) => b.monthly - a.monthly),
  };
}

/** Months since the newest pension report (YYYY-MM); null when none was imported. */
export function pensionAgeMonths(newestReport: string | null, today: string): number | null {
  if (!newestReport) return null;
  const y = Number(newestReport.slice(0, 4));
  const m = Number(newestReport.slice(5, 7));
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  if (![y, m, todayYear, todayMonth].every(Number.isFinite) || m < 1 || m > 12) return null;
  return Math.max(0, (todayYear - y) * 12 + (todayMonth - m));
}

const PENSION_STALE_MONTHS = 12;

export const isPensionStale = (months: number | null): boolean =>
  months != null && months >= PENSION_STALE_MONTHS;
