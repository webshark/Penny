import { addDays, dayDiff, monthDay } from "./balance-forecast";

/**
 * The household's own month: it starts on the plan's monthStartDay (salary or card-bill day), not
 * on the 1st. Budgets, recaps and the bot read this one range, so the same month means the same
 * dates everywhere.
 */
export interface BudgetMonth {
  /** YYYY-MM of the calendar month the period starts in. */
  key: string;
  from: string;
  to: string;
}

const clampDay = (day: number) => Math.max(1, Math.min(28, Math.trunc(Number(day)) || 1));
const pad = (n: number) => String(n).padStart(2, "0");

export function shiftBudgetMonthKey(key: string, offset: number): string {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + offset;
  return `${Math.floor(index / 12)}-${pad(((index % 12) + 12) % 12 + 1)}`;
}

/** The period that starts in the calendar month `key`. */
export function budgetMonthByKey(startDay: number, key: string): BudgetMonth {
  const day = clampDay(startDay);
  const [year, month] = key.split("-").map(Number);
  const from = monthDay(year, month - 1, day);
  const next = monthDay(year, month, day);
  return { key: `${year}-${pad(month)}`, from, to: addDays(next, -1) };
}

/** The period containing `today`, shifted back `offset` periods (0 = current). */
export function budgetMonthRange(startDay: number, today: string, offset = 0): BudgetMonth {
  const day = clampDay(startDay);
  const [year, month, date] = today.split("-").map(Number);
  let index = year * 12 + (month - 1);
  if (date < day) index -= 1;
  index += offset;
  const key = `${Math.floor(index / 12)}-${pad(((index % 12) + 12) % 12 + 1)}`;
  return budgetMonthByKey(day, key);
}

/** How much of the period has passed, 0..100. A period that has not started reads 0. */
export function elapsedPercent(today: string, from: string, to: string): number {
  if (today <= from) return 0;
  if (today >= to) return 100;
  const total = dayDiff(from, to) + 1;
  const done = dayDiff(from, today) + 1;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

/** Whole days still left in the period, today included. */
export function daysLeft(today: string, to: string): number {
  return Math.max(0, dayDiff(today, to) + 1);
}

export interface BudgetLineView {
  categoryId: number;
  name: string;
  base: number;
  carryIn: number;
  moves: number;
  budget: number;
  rollover: RolloverRule;
}

export interface BudgetPeriodView {
  period: BudgetMonth;
  startDay: number;
  planned: number;
  spent: number;
  leftover: number;
}

export interface BudgetHistoryView extends BudgetPeriodView {
  carryIn: number;
  closed: boolean;
}

export interface BudgetPeriodPayload {
  view: BudgetPeriodView;
  lines: BudgetLineView[];
  history: BudgetHistoryView[];
}

export const ROLLOVER_RULES = ["none", "positive", "negative", "both"] as const;
export type RolloverRule = (typeof ROLLOVER_RULES)[number];

export const isRolloverRule = (value: unknown): value is RolloverRule =>
  typeof value === "string" && (ROLLOVER_RULES as readonly string[]).includes(value);

/**
 * What carries into the next period. Capped at one period's budget in each direction, so a single
 * mistake cannot blow up or fully fund the next month.
 */
export function carryAmount(rule: RolloverRule, leftover: number, base: number): number {
  if (rule === "none" || base <= 0 || !Number.isFinite(leftover)) return 0;
  const value = rule === "positive" ? Math.max(0, leftover) : rule === "negative" ? Math.min(0, leftover) : leftover;
  const capped = Math.max(-base, Math.min(base, value));
  return Math.round(capped * 100) / 100;
}

/** The effective budget for a category in a period: its base, what carried in, and any moves. */
export function effectiveBudget(base: number, carryIn: number, moves = 0): number {
  return Math.max(0, Math.round((base + carryIn + moves) * 100) / 100);
}
