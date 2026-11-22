/**
 * A whole-life money model, in today's money: from today's age to 90.
 * It stands on the real household figures: income and spending from recent months,
 * the assets that can actually be spent, the pension that becomes an annuity,
 * the debts with their rate and payment, and the plan's life events.
 *
 * Shortcuts, on purpose and labelled:
 * - No tax: withdrawals, the annuity and the old-age pension are counted gross.
 * - One real return for every invested asset. Cash keeps its real value and earns nothing.
 * - Up to one year of spending stays in cash; the rest is invested.
 * - A home, a car and a business are not spending money, so they stay out of the runway.
 * - The pension turns into a level lifetime annuity at the pension age, using one factor.
 * - Spending after retirement stays at today's level.
 */

import { IL } from "./il-defaults";

export const LIFETIME_END_AGE = 90;
/** ₪ of pension balance per ₪1 of monthly lifetime annuity at retirement. */
export const DEFAULT_PENSION_FACTOR = 200;
/** Real yearly return on invested savings, after inflation. */
export const DEFAULT_REAL_RETURN = 0.04;

const CASH_TYPES = new Set(["cash", "deposit"]);
const PENSION_TYPES = new Set(["pension"]);
const ILLIQUID_TYPES = new Set(["real_estate", "vehicle", "business"]);

export interface LifetimeAssetInput {
  type: string;
  valueIls: number | null;
  /** Monthly deposits into a pension, study fund or provident fund. */
  monthlyDeposit?: number | null;
  /** Yearly fee on the balance, percent. */
  feeBalance?: number | null;
  isLiability?: boolean;
  /** Debts: yearly interest, percent. */
  interestRate?: number | null;
  /** Debts: monthly payment. */
  monthlyPayment?: number | null;
}

export interface LifetimeDebt {
  balance: number;
  /** Yearly interest as a fraction. */
  rate: number;
  /** Yearly payment. */
  payment: number;
}

export interface LifetimeBalances {
  cash: number;
  invested: number;
  pension: number;
  /** Yearly pension deposits. */
  pensionDepositYearly: number;
  /** Weighted yearly fee on the pension balance, as a fraction. */
  pensionFee: number;
  debts: LifetimeDebt[];
  /** A home, a car or a business: counted as wealth, never as spending money. */
  illiquid: number;
}

const finite = (n: unknown, fallback = 0) => {
  const value = Number(n);
  return Number.isFinite(value) ? value : fallback;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const whole = (n: number, min: number, max: number) => clamp(Math.round(finite(n)), min, max);
const positive = (n: unknown) => Math.max(0, finite(n));

/** Splits the asset list into the pools the projection needs. */
export function lifetimeBalances(assets: LifetimeAssetInput[]): LifetimeBalances {
  let cash = 0;
  let invested = 0;
  let pension = 0;
  let pensionDepositYearly = 0;
  let weightedFee = 0;
  let illiquid = 0;
  const debts: LifetimeDebt[] = [];

  for (const asset of assets) {
    const value = positive(asset.valueIls);
    if (asset.isLiability) {
      if (value > 0) {
        debts.push({
          balance: value,
          rate: clamp(positive(asset.interestRate) / 100, 0, 1),
          payment: positive(asset.monthlyPayment) * 12,
        });
      }
      continue;
    }
    if (PENSION_TYPES.has(asset.type)) {
      pension += value;
      pensionDepositYearly += positive(asset.monthlyDeposit) * 12;
      weightedFee += value * positive(asset.feeBalance);
      continue;
    }
    if (ILLIQUID_TYPES.has(asset.type)) {
      illiquid += value;
      continue;
    }
    if (CASH_TYPES.has(asset.type)) cash += value;
    else invested += value;
  }

  return {
    cash,
    invested,
    pension,
    pensionDepositYearly,
    pensionFee: pension > 0 ? weightedFee / pension / 100 : 0,
    debts,
    illiquid,
  };
}

export interface LifetimeEventInput {
  year: number;
  /** One-off amount, negative = cost. */
  amount: number;
  /** Extra monthly spending from that year on, negative = less. */
  monthlyChange: number;
}

export interface LifetimeInput {
  /** Age today, in years. */
  startAge: number;
  startYear: number;
  retirementAge: number;
  /** Net household income today, monthly, in today's money. */
  monthlyIncome: number;
  /** Household spending today, monthly, in today's money. */
  monthlyExpenses: number;
  /** Old-age Bituach Leumi, monthly. Omitted or 0 = not counted. */
  monthlyStatePension?: number;
  assets: LifetimeAssetInput[];
  events?: LifetimeEventInput[];
  /** Real yearly return on invested savings, e.g. 0.04. */
  realReturn?: number;
  /** ₪ of pension balance per ₪1 of monthly annuity. */
  pensionFactor?: number;
  /** Share of today's spending kept after retirement, e.g. 1 = the same. */
  retirementSpendPct?: number;
  /** When the pension annuity and the old-age pension start. Defaults to max(retirementAge, IL.pensionAge). */
  pensionStartAge?: number;
}

export interface LifetimeRow {
  age: number;
  year: number;
  /** Cash and investments: the money the household can draw on. */
  liquid: number;
  /** Pension balance not yet turned into the annuity. */
  pension: number;
  debt: number;
  /** What the year paid on its debts. */
  debtPayment: number;
  /** Level monthly annuity from the pension, once it starts. */
  annuityMonthly: number;
}

export interface LifetimeResult {
  rows: LifetimeRow[];
  /** First age whose year could not be covered, or null when the money lasts to the end age. */
  ranOutAge: number | null;
  startAge: number;
  endAge: number;
  pensionStartAge: number;
  annuityMonthly: number;
  liquidNow: number;
  debtNow: number;
  /** A home, a car or a business: wealth, but not money the household can spend. */
  illiquidNow: number;
}

/**
 * Runs the projection year by year. Growth is applied first, then the year's events,
 * then income and spending, then debt payments, and the cash shortfall is covered from
 * investments. When both are empty and the year still needs money, that age is `ranOutAge`.
 */
export function simulateLifetime(input: LifetimeInput): LifetimeResult {
  const endAge = LIFETIME_END_AGE;
  const startAge = whole(input.startAge, 0, endAge);
  const retirementAge = whole(input.retirementAge, startAge, endAge);
  const pensionStartAge = whole(input.pensionStartAge ?? Math.max(retirementAge, IL.pensionAge), startAge, endAge);
  const startYear = Math.round(finite(input.startYear));
  const realReturn = clamp(finite(input.realReturn, DEFAULT_REAL_RETURN), -0.2, 0.2);
  const pensionFactor = Math.max(1, finite(input.pensionFactor, DEFAULT_PENSION_FACTOR));
  const retirementSpendPct = clamp(finite(input.retirementSpendPct, 1), 0, 1.5);
  const monthlyIncome = positive(input.monthlyIncome);
  const monthlyExpenses = positive(input.monthlyExpenses);
  const monthlyStatePension = positive(input.monthlyStatePension);
  const events = input.events ?? [];
  const balances = lifetimeBalances(input.assets);

  let cash = balances.cash;
  let invested = balances.invested;
  let pension = balances.pension;
  let annuityMonthly = 0;
  let ranOutAge: number | null = null;

  // Already past the pension age: the balance is an annuity from today.
  if (startAge >= pensionStartAge && pension > 0) {
    annuityMonthly = pension / pensionFactor;
    pension = 0;
  }

  const debtTotal = () => balances.debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
  const debtNow = debtTotal();

  const snapshot = (age: number, year: number, debtPayment: number): LifetimeRow => ({
    age,
    year,
    liquid: cash + invested,
    pension,
    debt: debtTotal(),
    debtPayment,
    annuityMonthly,
  });

  const rows: LifetimeRow[] = [snapshot(startAge, startYear, 0)];

  for (let age = startAge; age < endAge; age++) {
    const year = startYear + (age - startAge);

    if (age === pensionStartAge && pension > 0) {
      annuityMonthly = pension / pensionFactor;
      pension = 0;
    }

    invested *= 1 + realReturn;
    if (age < pensionStartAge) {
      const deposits = age < retirementAge ? balances.pensionDepositYearly : 0;
      pension = Math.max(0, pension * (1 + realReturn - balances.pensionFee) + deposits);
    }

    let oneOff = 0;
    let extraMonthly = 0;
    for (const event of events) {
      const eventYear = Math.round(finite(event.year));
      if (eventYear === year) oneOff += finite(event.amount);
      if (eventYear <= year) extraMonthly += finite(event.monthlyChange);
    }

    const retired = age >= retirementAge;
    const pensionIncome = age >= pensionStartAge ? (annuityMonthly + monthlyStatePension) * 12 : 0;
    const income = (retired ? 0 : monthlyIncome * 12) + pensionIncome;
    const expenses = Math.max(0, monthlyExpenses * (retired ? retirementSpendPct : 1) + extraMonthly) * 12;

    let debtPayment = 0;
    for (const debt of balances.debts) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * debt.rate;
      const due = debt.payment > 0 ? Math.min(debt.balance + interest, debt.payment) : 0;
      debt.balance = debt.balance + interest - due;
      debtPayment += due;
    }

    cash += oneOff + income - expenses - debtPayment;
    if (cash < 0) {
      invested += cash;
      cash = 0;
    }
    if (invested < 0) {
      invested = 0;
      cash = 0;
      if (ranOutAge == null) ranOutAge = age;
    }

    // Keep up to a year of spending in cash, so the rest can earn a real return.
    const buffer = expenses;
    if (cash > buffer) {
      invested += cash - buffer;
      cash = buffer;
    }

    rows.push(snapshot(age + 1, year + 1, debtPayment));
  }

  return {
    rows,
    ranOutAge,
    startAge,
    endAge,
    pensionStartAge,
    annuityMonthly,
    liquidNow: balances.cash + balances.invested,
    debtNow,
    illiquidNow: balances.illiquid,
  };
}
