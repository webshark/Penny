// Client-safe date math on YYYY-MM-DD strings, in UTC so the host timezone never shifts a day.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];

export const addDays = (date: string, days: number) => {
  const [y, m, d] = parts(date);
  return ymd(y, m - 1, d + days);
};

/** Same day of month, clamped to the target month's length. */
export function monthDay(year: number, month0: number, day: number): string {
  const y = year + Math.floor(month0 / 12);
  const m0 = ((month0 % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return `${y}-${pad(m0 + 1)}-${pad(Math.min(day, last))}`;
}

export type Cadence = "weekly" | "monthly" | "yearly";

/** The k-th expected charge after `lastDate` (k = 1 is the next one). */
export function nthCharge(cadence: Cadence, lastDate: string, k: number): string {
  const [y, m, d] = parts(lastDate);
  if (cadence === "weekly") return addDays(lastDate, 7 * k);
  return monthDay(y, m - 1 + (cadence === "monthly" ? k : 12 * k), d);
}

/**
 * "upcoming transactions": recurring charges that are late (expected in the last `lateDays`
 * days but not seen yet) or due within the next `days` days, soonest first.
 */
export function upcomingCharges<T extends { cadence: Cadence; lastDate: string }>(series: T[], today: string, days = 3, lateDays = 5) {
  const from = addDays(today, -lateDays), to = addDays(today, days);
  return series
    .map((s) => ({ ...s, due: nthCharge(s.cadence, s.lastDate, 1) }))
    .filter((s) => s.due >= from && s.due <= to)
    .map((s) => ({ ...s, overdue: s.due < today }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** Expected charge dates of a series within [from, to]. */
export function chargesBetween(cadence: Cadence, lastDate: string, from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = 1; k < 600; k++) {
    const date = nthCharge(cadence, lastDate, k);
    if (date > to) break;
    if (date >= from) out.push(date);
  }
  return out;
}

export type ForecastEvent = { date: string; amount: number; kind: "income" | "card" | "recurring" };

export interface BalanceForecast {
  events?: ForecastEvent[];
  points: { date: string; balance: number }[];
  low: { date: string; balance: number };
  /** First day the balance goes below zero, if it does. */
  firstNegative: string | null;
  /** First payday after the low point, if one falls inside the window. */
  nextPayday: string | null;
}

/**
 * Bank balance day by day: today's synced balance, plus salary on payday, minus card bills on their
 * forecast dates and recurring bank debits on their expected dates. Today's point is the balance as synced.
 */
export function forecastBalance(input: {
  today: string;
  bank: number;
  payday: number;
  monthlyIncome: number;
  bills: { date: string; total: number }[];
  recurring: { cadence: Cadence; lastDate: string; amount: number }[];
  days?: number;
  scheduled?: {date:string;total:number}[];
}): BalanceForecast {
  const days = input.days ?? 90;
  const end = addDays(input.today, days);
  const from = addDays(input.today, 1);
  const delta = new Map<string, number>();
  const events: ForecastEvent[] = [];
  const add = (date: string, n: number) => delta.set(date, (delta.get(date) ?? 0) + n);

  const [y, m] = parts(input.today);
  const paydays: string[] = [];
  for (let k = 0; k <= 4; k++) {
    const d = monthDay(y, m - 1 + k, input.payday);
    if (d >= from && d <= end) paydays.push(d);
  }
  if (!(input.monthlyIncome > 0)) paydays.length = 0;
  for (const d of paydays) { add(d, input.monthlyIncome); events.push({ date: d, amount: input.monthlyIncome, kind: "income" }); }
  for (const b of input.bills) if (b.date >= from && b.date <= end) { add(b.date, -b.total); events.push({ date: b.date, amount: -b.total, kind: "card" }); }
  for (const s of input.recurring) for (const d of chargesBetween(s.cadence, s.lastDate, from, end)) { add(d, -s.amount); events.push({ date: d, amount: -s.amount, kind: "recurring" }); }

  for(const event of input.scheduled??[]) if(event.date>=from&&event.date<=end) { add(event.date,-event.total); events.push({date:event.date,amount:-event.total,kind:"recurring"}); }
  const points = [{ date: input.today, balance: input.bank }];
  for (let i = 1; i <= days; i++) {
    const date = addDays(input.today, i);
    points.push({ date, balance: points[i - 1].balance + (delta.get(date) ?? 0) });
  }
  const low = points.reduce((a, b) => (b.balance < a.balance ? b : a));
  return {
    points,
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
    low,
    firstNegative: points.find((p) => p.balance < 0)?.date ?? null,
    nextPayday: paydays.find((d) => d > low.date) ?? null,
  };
}

// ---- Per-account projection -------------------------------------------------

export interface ForecastAccountInput {
  account: string;
  name: string;
  provider: string;
  /** Synced balance today. */
  balance: number;
  /** When the balance was last synced (YYYY-MM-DD), null when unknown. */
  balanceDate?: string | null;
  /** Everyday spend that never reaches a card or a recurring item, per day (Bit, cash, debit). */
  dailyRate?: number;
}

export type AccountEventKind = "income" | "card" | "recurring" | "planned";

export interface AccountEventInput {
  date: string;
  account: string;
  name: string;
  /** Signed ILS: negative leaves the account. */
  amount: number;
  kind: AccountEventKind;
  /** An estimate may be worse than expected: outflows +10%, inflows −10%. */
  estimated?: boolean;
  /** Card bills: which card the statement belongs to. */
  card?: string | null;
}

export interface AccountPoint {
  date: string;
  expected: number;
  low: number;
  high: number;
}

export interface AccountForecast {
  account: string;
  name: string;
  provider: string;
  startBalance: number;
  balanceDate: string | null;
  /** The synced balance is more than 3 days old. */
  stale: boolean;
  points: AccountPoint[];
  lowest: { date: string; amount: number };
  /** Expected balance at the end of the window. */
  endBalance: number;
  dailyRate: number;
  /** Money to add so the balance never drops below the buffer, and the day it is first needed. */
  shortfall: { amount: number; by: string | null };
}

export interface AccountsForecast {
  asOf: string;
  horizonEnd: string;
  buffer: number;
  accounts: AccountForecast[];
  /** Every account added together. */
  total: AccountForecast;
  events: AccountEventInput[];
  /** Accounts that are expected to dip below the buffer. */
  warnings: { account: string; name: string; date: string; amount: number }[];
}

/** Which bank pays a card's monthly statement, and whether we worked it out or the user set it. */
export interface CardBankLink {
  card: string;
  cardName: string;
  bank: string;
  inferred: boolean;
}

/** The balance forecast API: the flat card plus the per-account projection it is built from. */
export interface BalanceForecastPayload extends AccountsForecast {
  cardBanks: CardBankLink[];
}

/** Days from `from` to `to`, positive when `to` is later. */
export function dayDiff(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Day-by-day balance of every bank account, each with a low/high band for estimates.
 * A single account's curve is the same arithmetic as forecastBalance, but estimates are allowed
 * to be worse than expected and everyday spend runs every day.
 */
export function projectAccounts(input: {
  today: string;
  accounts: ForecastAccountInput[];
  events: AccountEventInput[];
  days?: number;
  buffer?: number;
}): AccountsForecast {
  const days = input.days ?? 90;
  const buffer = input.buffer ?? 0;
  const horizonEnd = addDays(input.today, days);

  const accounts: AccountForecast[] = input.accounts.map((acc) => {
    const rate = Math.max(0, acc.dailyRate ?? 0);
    const byDate = new Map<string, AccountEventInput[]>();
    for (const e of input.events) {
      if (e.account !== acc.account || e.date <= input.today || e.date > horizonEnd) continue;
      byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    }

    let expected = acc.balance;
    let low = acc.balance;
    let high = acc.balance;
    const points: AccountPoint[] = [{ date: input.today, expected: round2(expected), low: round2(low), high: round2(high) }];
    for (let date = addDays(input.today, 1); date <= horizonEnd; date = addDays(date, 1)) {
      for (const e of byDate.get(date) ?? []) {
        expected += e.amount;
        if (e.estimated) {
          low += e.amount < 0 ? e.amount * 1.1 : e.amount * 0.9;
          high += e.amount < 0 ? e.amount * 0.9 : e.amount * 1.05;
        } else {
          low += e.amount;
          high += e.amount;
        }
      }
      expected -= rate;
      low -= rate * 1.3;
      high -= rate * 0.7;
      points.push({ date, expected: round2(expected), low: round2(low), high: round2(high) });
    }

    const lowest = points.reduce((a, b) => (b.expected < a.expected ? b : a));
    const balanceDate = acc.balanceDate ? acc.balanceDate.slice(0, 10) : null;
    const belowZero = points.find((p) => p.expected < 0)?.date ?? null;
    const belowBuffer = points.find((p) => p.expected < buffer)?.date ?? null;
    return {
      account: acc.account,
      name: acc.name,
      provider: acc.provider,
      startBalance: round2(acc.balance),
      balanceDate,
      stale: !balanceDate || dayDiff(balanceDate, input.today) > 3,
      points,
      lowest: { date: lowest.date, amount: round2(lowest.expected) },
      endBalance: points[points.length - 1].expected,
      dailyRate: round2(rate),
      shortfall: {
        amount: round2(Math.max(0, buffer - Math.min(lowest.expected, acc.balance))),
        by: belowZero ?? belowBuffer,
      },
    };
  });

  const totalPoints = accounts[0]?.points.map((p, i) => ({
    date: p.date,
    expected: round2(accounts.reduce((s, a) => s + a.points[i].expected, 0)),
    low: round2(accounts.reduce((s, a) => s + a.points[i].low, 0)),
    high: round2(accounts.reduce((s, a) => s + a.points[i].high, 0)),
  })) ?? [];
  const totalLowest = totalPoints.length
    ? totalPoints.reduce((a, b) => (b.expected < a.expected ? b : a))
    : { date: input.today, expected: 0 };
  const total: AccountForecast = {
    account: "total",
    name: "total",
    provider: "",
    startBalance: round2(accounts.reduce((s, a) => s + a.startBalance, 0)),
    balanceDate: null,
    stale: accounts.some((a) => a.stale),
    points: totalPoints,
    lowest: { date: totalLowest.date, amount: round2(totalLowest.expected) },
    endBalance: totalPoints[totalPoints.length - 1]?.expected ?? 0,
    dailyRate: round2(accounts.reduce((s, a) => s + a.dailyRate, 0)),
    shortfall: {
      amount: round2(accounts.reduce((s, a) => s + a.shortfall.amount, 0)),
      by: accounts.map((a) => a.shortfall.by).filter((d): d is string => !!d).sort()[0] ?? null,
    },
  };

  return {
    asOf: input.today,
    horizonEnd,
    buffer,
    accounts,
    total,
    events: [...input.events].sort((a, b) => a.date.localeCompare(b.date)),
    warnings: accounts
      .filter((a) => a.lowest.amount < buffer)
      .map((a) => ({ account: a.account, name: a.name, date: a.lowest.date, amount: a.lowest.amount })),
  };
}

/** Splits a month's charges into small / medium / large by thirds of the month itself; returns the tier of an amount. */
export function sizeTier(amounts: number[]): (amount: number) => 0 | 1 | 2 {
  const sorted = [...amounts].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length / 3)] ?? 0;
  const hi = sorted[Math.floor((2 * sorted.length) / 3)] ?? 0;
  return (n) => (n >= hi && n > lo ? 2 : n >= lo && n > sorted[0] ? 1 : 0);
}
