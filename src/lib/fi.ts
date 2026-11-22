/** Financial independence math, after HaExolidit's "עד מתי?!", "חיסכון אגרסיבי" and "הרכב כמגרסה" sheets. */

/** Money needed so that withdrawing `rate` a year covers `annualSpend` (4% -> 25x, 3% -> 33x). */
export function fiNumber(annualSpend: number, withdrawalRate: number): number {
  return withdrawalRate > 0 ? annualSpend / withdrawalRate : Infinity;
}

const MAX_YEARS = 100;

/**
 * Years until savings reach `target`, saving `monthlySaving` a month at `annualReturn`, compounded monthly.
 * 0 if already there; null if it never gets there within 100 years.
 */
export function yearsToTarget(current: number, monthlySaving: number, annualReturn: number, target: number): number | null {
  if (current >= target) return 0;
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let balance = current;
  for (let month = 1; month <= MAX_YEARS * 12; month++) {
    balance = balance * (1 + r) + monthlySaving;
    if (balance >= target) return month / 12;
  }
  return null;
}

/**
 * Early-retirement bridge: retiring at `fiAge`, the savings must carry you alone until pensions start at `pensionAge`,
 * then only the part of spending the pensions don't cover. Today's money, with `realReturn` a year.
 */
export function fiBridge(i: { fiAge: number; pensionAge: number; monthlySpend: number; monthlyPension: number; withdrawalRate: number; realReturn: number }) {
  const gapYears = Math.max(0, i.pensionAge - i.fiAge);
  const after = fiNumber(Math.max(0, i.monthlySpend - i.monthlyPension) * 12, i.withdrawalRate);
  // Spend through the gap, then have `after` left at pension age; both discounted back to fiAge.
  const r = Math.pow(1 + i.realReturn, 1 / 12) - 1;
  const n = Math.round(gapYears * 12);
  const bridge = r === 0 ? i.monthlySpend * n : (i.monthlySpend * (1 - (1 + r) ** -n)) / r;
  const total = bridge + after / (1 + r) ** n;
  return { gapYears, bridge, after, total };
}

/** "Can I stop saving now": does today's balance grow, with no more deposits, to `target` in `years`? */
export function coastCheck(current: number, annualReturn: number, years: number, target: number) {
  const f = (1 + annualReturn) ** Math.max(0, years);
  return { atTarget: current * f, coastNumber: target / f, canStop: current * f >= target };
}

/** Years to FI at each savings rate, for a given income, current savings, return and withdrawal rate. */
export function yearsBySavingsRate(income: number, current: number, annualReturn: number, withdrawalRate: number, rates = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
  return rates.map((s) => ({ rate: s, years: yearsToTarget(current, income * s, annualReturn, fiNumber(income * (1 - s) * 12, withdrawalRate)) }));
}

export interface CarInputs {
  purchasePrice: number;
  currentValue: number;
  kmDriven: number;
  kmPerYear: number;
  kmPerLiter: number;
  fuelPrice: number;
  annualTest: number;
  annualInsurance: number;
  annualMaintenance: number;
}

/** Yearly cost of owning the car (depreciation spread over the years owned, plus running costs) and cost per km. */
export function carCost(c: CarInputs): { years: number; perYear: number; perKm: number } | null {
  if (c.kmPerYear <= 0 || c.kmPerLiter <= 0) return null;
  const years = c.kmDriven / c.kmPerYear;
  const depreciation = years > 0 ? (c.purchasePrice - c.currentValue) / years : 0;
  const fuel = (c.kmPerYear / c.kmPerLiter) * c.fuelPrice;
  const perYear = depreciation + fuel + c.annualTest + c.annualInsurance + c.annualMaintenance;
  return { years, perYear, perKm: perYear / c.kmPerYear };
}

export interface FiEvent {
  year: number;
  /** One-off, negative = cost. */
  amount: number;
  /** Extra monthly spending from that year on (negative = spend less). */
  monthlyChange: number;
}

/**
 * Like yearsToTarget, with life events and an optional return per year (for Monte Carlo).
 * shortcut: monthlyChange moves the saving only, not the FI number; upgrade if events should change the target too.
 */
export function yearsToTargetWithEvents(
  current: number, monthlySaving: number, annualReturn: number | number[], target: number, events: FiEvent[], startYear: number, maxYears = MAX_YEARS
): number | null {
  let balance = current;
  for (let y = 0; y < maxYears; y++) {
    const year = startYear + y;
    const ret = typeof annualReturn === "number" ? annualReturn : annualReturn[y];
    const r = Math.pow(1 + Math.max(-0.99, ret), 1 / 12) - 1;
    let saving = monthlySaving;
    for (const e of events) {
      if (e.year === year) balance += e.amount;
      if (e.year <= year) saving -= e.monthlyChange;
    }
    if (y === 0 && balance >= target) return 0;
    for (let m = 1; m <= 12; m++) {
      balance = balance * (1 + r) + saving;
      if (balance >= target) return y + m / 12;
    }
  }
  return null;
}

/** Small seeded PRNG (mulberry32) so the odds don't jump between renders. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monte Carlo: yearly returns ~ normal(mean, sd). Chance to reach the target within `years`,
 * and the 10th/50th/90th percentile year (null = not within 100 years).
 */
export function fiOdds(
  current: number, monthlySaving: number, meanReturn: number, target: number, years: number,
  events: FiEvent[] = [], startYear = new Date().getFullYear(), runs = 1000, sd = 0.15, seed = 42
): { probability: number; p10: number | null; p50: number | null; p90: number | null } {
  const rand = mulberry32(seed);
  const results: number[] = [];
  for (let i = 0; i < runs; i++) {
    const returns = Array.from({ length: MAX_YEARS }, () => {
      const u = 1 - rand();
      return meanReturn + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    });
    results.push(yearsToTargetWithEvents(current, monthlySaving, returns, target, events, startYear) ?? Infinity);
  }
  results.sort((a, b) => a - b);
  const at = (q: number) => {
    const v = results[Math.min(runs - 1, Math.floor(q * runs))];
    return Number.isFinite(v) ? v : null;
  };
  return { probability: results.filter((y) => y <= years).length / runs, p10: at(0.1), p50: at(0.5), p90: at(0.9) };
}
/**
 * FIRE variants: the target and years to it for a lean life (70% of today's spending),
 * today's life, and a fat one (150%); and Coast FIRE, the sum that grows alone to today's target by retirement.
 */
export function fireVariants(i: { monthlySpend: number; savings: number; monthlySaving: number; annualReturn: number; withdrawalRate: number; yearsToRetirement: number | null }) {
  const variant = (share: number) => {
    const target = fiNumber(i.monthlySpend * share * 12, i.withdrawalRate);
    return { target, years: yearsToTarget(i.savings, Math.max(0, i.monthlySaving), i.annualReturn, target) };
  };
  const regular = variant(1);
  const coast = i.yearsToRetirement == null ? null : coastCheck(i.savings, i.annualReturn, i.yearsToRetirement, regular.target);
  return { lean: variant(0.7), regular, fat: variant(1.5), coast };
}
