/**
 * Planned one-off expenses: a purchase you know is coming before the card or bank has charged it.
 * The point is the match: when the real row arrives, it is linked, stops counting as planned, and
 * carries the category / owner / tags you set in advance. Estimates, not advice.
 */
import { addDays, monthDay } from "./balance-forecast";

export const PLANNED_STATUSES = ["planned", "matched", "cancelled"] as const;
export type PlannedStatus = (typeof PLANNED_STATUSES)[number];
export const PLANNED_ACCOUNT_KINDS = ["bank", "card", "manual"] as const;
export type PlannedAccountKind = (typeof PLANNED_ACCOUNT_KINDS)[number];

export interface PlannedItem {
  id: number;
  description: string;
  /** Positive ILS, the whole purchase. */
  amount: number;
  /** Expected purchase date, YYYY-MM-DD. */
  date: string;
  /** Account number it will be charged to; null for a manual item. */
  account: string | null;
  accountKind: PlannedAccountKind;
  installments: number;
  /** Text that identifies the real row (e.g. the shop name). */
  matchPattern: string | null;
  categoryId: number | null;
  /** Household member id or "shared". */
  owner: string | null;
  notes: string | null;
  status: PlannedStatus;
  matchedTxnId: number | null;
  /** Rows the user said are not it, so they are never matched again. */
  rejectedTxnIds: number[];
}

/** One payment of a planned item: when it counts as spend and when it leaves the account. */
export interface PlannedPayment {
  itemId: number;
  description: string;
  account: string | null;
  /** Whether the account is a bank or a card (the forecast needs to know where the money leaves). */
  accountKind: PlannedAccountKind;
  /** 1-based payment number. */
  n: number;
  amount: number;
  /** The date it counts on in spend / budget (purchase date; installments: the charge date). */
  spendDate: string;
  /** When it leaves the account (card: the estimated statement date). */
  chargeDate: string;
  /** Card: the statement month it is charged in; bank / manual: null. */
  chargeMonth: string | null;
}

/** A real transaction that may be the planned purchase. `amount` is positive spending. */
export interface PlannedCharge {
  id: number;
  description: string;
  /** Purchase date. */
  date: string;
  /** Card statement date (processed date). */
  billingDate: string;
  account: string;
  amount: number;
  installmentNumber: number | null;
}

export interface PlannedCandidate extends PlannedCharge {
  /** Days between the planned and the real purchase. */
  daysOff: number;
}

export interface PlannedItemView extends PlannedItem {
  payments: PlannedPayment[];
  /** When the first unpaid payment is expected. */
  nextPayment: PlannedPayment | null;
  /** Real rows that could be this item, when more than one fits. */
  candidates: PlannedCandidate[];
  overdue: boolean;
}

export interface PlannedAccount {
  account: string;
  provider: string;
  kind: "bank" | "card";
}

export interface PlannedPayload {
  items: PlannedItemView[];
  accounts: PlannedAccount[];
  totals: { planned: number; matched: number; overdue: number; upcoming: number };
}

/** A card's billing habits from its recent rows: purchase-to-statement lag and the statement day. */
export interface CardTiming {
  lag: number;
  day: number;
}

const round = (n: number) => Math.round(n * 100) / 100;
const median = (nums: number[]): number => {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const addMonths = (month: string, n: number): string => {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const monthsBetween = (from: string, to: string): number =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** Learns a card's lag and statement day from rows whose purchase and billing dates differ. */
export function cardTiming(charges: PlannedCharge[], account: string, fallbackDay = 10): CardTiming {
  const rows = charges
    .filter((c) => c.account === account && c.billingDate && c.billingDate.slice(0, 10) !== c.date.slice(0, 10))
    .slice(-200);
  const lags = rows.map((c) => monthsBetween(c.date.slice(0, 7), c.billingDate.slice(0, 7)));
  const days = rows.map((c) => Number(c.billingDate.slice(8, 10))).filter((d) => d > 0);
  return { lag: lags.length ? Math.max(0, Math.round(median(lags))) : 1, day: days.length ? Math.round(median(days)) : fallbackDay };
}

/** The payments of an item: one, or one per installment on consecutive statements / months. */
export function plannedPayments(item: Pick<PlannedItem, "id" | "description" | "amount" | "date" | "account" | "accountKind" | "installments">, timing: CardTiming | null = null): PlannedPayment[] {
  const installments = Math.max(1, Math.min(60, item.installments || 1));
  const per = round(item.amount / installments);
  const out: PlannedPayment[] = [];
  for (let k = 0; k < installments; k++) {
    // The last payment takes the rounding remainder.
    const amount = k === installments - 1 ? round(item.amount - per * (installments - 1)) : per;
    if (item.accountKind === "card" && timing) {
      const chargeMonth = addMonths(item.date.slice(0, 7), timing.lag + k);
      const [y, m] = chargeMonth.split("-").map(Number);
      const chargeDate = monthDay(y, m - 1, timing.day);
      out.push({
        itemId: item.id,
        description: item.description,
        account: item.account,
        accountKind: item.accountKind,
        n: k + 1,
        amount,
        spendDate: installments > 1 ? chargeDate : item.date,
        chargeDate,
        chargeMonth,
      });
    } else {
      const [y, m] = addMonths(item.date.slice(0, 7), k).split("-").map(Number);
      const chargeDate = monthDay(y, m - 1, Number(item.date.slice(8, 10)));
      out.push({
        itemId: item.id,
        description: item.description,
        account: item.account,
        accountKind: item.accountKind,
        n: k + 1,
        amount,
        spendDate: chargeDate,
        chargeDate,
        chargeMonth: null,
      });
    }
  }
  return out;
}

/** How far the planned date may be from the real purchase for them to match. */
export const MATCH_BEFORE_DAYS = 7;
export const MATCH_AFTER_DAYS = 30;

/** Real rows that could be this planned expense: same account, close amount, near the planned date. */
export function plannedCandidates(
  item: Pick<PlannedItem, "id" | "amount" | "date" | "account" | "accountKind" | "installments" | "matchPattern" | "rejectedTxnIds">,
  charges: PlannedCharge[],
  claimed: Set<number>
): PlannedCandidate[] {
  if (item.accountKind === "manual" || !item.account) return [];
  const full = item.amount;
  const installments = Math.max(1, item.installments || 1);
  const per = full / installments;
  const close = (value: number, target: number) => Math.abs(value - target) <= Math.max(20, target * 0.1);
  const pattern = (item.matchPattern ?? "").trim().toLowerCase();
  const from = addDays(item.date, -MATCH_BEFORE_DAYS);
  const to = addDays(item.date, MATCH_AFTER_DAYS);
  const rejected = new Set(item.rejectedTxnIds ?? []);
  return charges
    .filter(
      (c) =>
        c.account === item.account &&
        c.amount > 0 &&
        !claimed.has(c.id) &&
        !rejected.has(c.id) &&
        c.date >= from &&
        c.date <= to &&
        // An installment purchase is recognised by its first payment (or by the whole amount, if reported so).
        (c.installmentNumber == null || c.installmentNumber <= 1) &&
        (close(c.amount, full) || (installments > 1 && close(c.amount, per))) &&
        (!pattern || c.description.toLowerCase().includes(pattern))
    )
    .map((c) => ({ ...c, daysOff: Math.abs(daysBetween(item.date, c.date)) }));
}

/** Days from `from` to `to` on YYYY-MM-DD strings, positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Past the matching window and the real row still is not there. */
export const isOverdue = (item: Pick<PlannedItem, "status" | "date">, asOf: string): boolean =>
  item.status === "planned" && addDays(item.date, MATCH_AFTER_DAYS) < asOf;

/** Planned (not yet charged) payments that count as spend between two dates. */
export function plannedSpend(
  items: Pick<PlannedItem, "status" | "id" | "description" | "amount" | "date" | "account" | "accountKind" | "installments">[],
  timings: Map<number, CardTiming | null>,
  from: string,
  to: string,
  asOf: string
): PlannedPayment[] {
  return items
    .filter((i) => i.status === "planned")
    .flatMap((item) =>
      plannedPayments(item, item.accountKind === "card" ? (timings.get(item.id) ?? null) : null).map((p) => ({
        ...p,
        // A date that passed without the row arriving is still expected — count it from today.
        spendDate: p.spendDate < asOf ? asOf : p.spendDate,
      }))
    )
    .filter((p) => p.spendDate >= from && p.spendDate <= to);
}

/** The next payment that has not left the account yet. */
export function nextPayment(payments: PlannedPayment[], asOf: string): PlannedPayment | null {
  return [...payments].sort((a, b) => a.chargeDate.localeCompare(b.chargeDate)).find((p) => p.chargeDate >= asOf) ?? null;
}
