import { describe, expect, it } from "vitest";
import {
  DEFAULT_PENSION_FACTOR,
  LIFETIME_END_AGE,
  lifetimeBalances,
  simulateLifetime,
  type LifetimeInput,
} from "@/lib/lifetime";

const base = (over: Partial<LifetimeInput> = {}): LifetimeInput => ({
  startAge: 40,
  startYear: 2026,
  retirementAge: 67,
  monthlyIncome: 20_000,
  monthlyExpenses: 10_000,
  assets: [],
  realReturn: 0,
  pensionFactor: DEFAULT_PENSION_FACTOR,
  ...over,
});

describe("lifetimeBalances", () => {
  it("splits cash, investments, pension and debts, and keeps property out of the runway", () => {
    const b = lifetimeBalances([
      { type: "cash", valueIls: 50_000 },
      { type: "fund", valueIls: 100_000 },
      { type: "pension", valueIls: 200_000, monthlyDeposit: 1_000, feeBalance: 0.5 },
      { type: "real_estate", valueIls: 2_000_000 },
      { type: "mortgage", valueIls: 500_000, isLiability: true, interestRate: 4, monthlyPayment: 3_000 },
    ]);

    expect(b.cash).toBe(50_000);
    expect(b.invested).toBe(100_000);
    expect(b.pension).toBe(200_000);
    expect(b.pensionDepositYearly).toBe(12_000);
    expect(b.pensionFee).toBeCloseTo(0.005);
    expect(b.illiquid).toBe(2_000_000);
    expect(b.debts).toEqual([{ balance: 500_000, rate: 0.04, payment: 36_000 }]);
  });

  it("ignores empty values and debts without a balance", () => {
    const b = lifetimeBalances([
      { type: "cash", valueIls: null },
      { type: "loan", valueIls: 0, isLiability: true },
    ]);
    expect(b.cash).toBe(0);
    expect(b.debts).toHaveLength(0);
  });
});

describe("simulateLifetime", () => {
  it("runs to the end age", () => {
    const r = simulateLifetime(base());
    expect(r.startAge).toBe(40);
    expect(r.rows.at(-1)?.age).toBe(LIFETIME_END_AGE);
    expect(r.rows).toHaveLength(LIFETIME_END_AGE - 40 + 1);
  });

  it("reports the age the money runs out", () => {
    const r = simulateLifetime(base({ monthlyIncome: 0, assets: [{ type: "cash", valueIls: 120_000 }] }));
    expect(r.ranOutAge).toBe(41);
    expect(r.rows.find((row) => row.age === 41)?.liquid).toBe(0);
  });

  it("keeps the money to the end when salary and the old-age pension cover spending", () => {
    const r = simulateLifetime(
      base({ monthlyIncome: 25_000, monthlyStatePension: 10_000, assets: [{ type: "cash", valueIls: 100_000 }] })
    );
    expect(r.ranOutAge).toBeNull();
    expect(r.rows.at(-1)?.liquid).toBeGreaterThan(1_000_000);
  });

  it("counts a home as wealth but not as spending money", () => {
    const r = simulateLifetime(
      base({ monthlyIncome: 0, assets: [{ type: "real_estate", valueIls: 3_000_000 }] })
    );
    expect(r.liquidNow).toBe(0);
    expect(r.illiquidNow).toBe(3_000_000);
    expect(r.ranOutAge).toBe(40);
  });

  it("turns the pension into a lifetime annuity at 67", () => {
    const withPension = simulateLifetime(
      base({
        monthlyIncome: 6_000,
        monthlyExpenses: 6_000,
        assets: [{ type: "pension", valueIls: 1_200_000 }],
      })
    );
    expect(withPension.annuityMonthly).toBe(6_000);
    expect(withPension.ranOutAge).toBeNull();

    const withoutPension = simulateLifetime(base({ monthlyIncome: 6_000, monthlyExpenses: 6_000 }));
    expect(withoutPension.ranOutAge).toBe(67);
  });

  it("starts the annuity at once for someone already past the pension age", () => {
    const r = simulateLifetime(
      base({
        startAge: 70,
        retirementAge: 70,
        monthlyIncome: 0,
        monthlyExpenses: 6_000,
        assets: [{ type: "pension", valueIls: 1_200_000 }],
      })
    );
    expect(r.annuityMonthly).toBe(6_000);
    expect(r.rows[0]?.annuityMonthly).toBe(6_000);
    expect(r.rows[0]?.pension).toBe(0);
  });

  it("pays a debt down and stops the payment when it is gone", () => {
    const r = simulateLifetime(
      base({
        monthlyIncome: 10_000,
        monthlyExpenses: 5_000,
        assets: [
          { type: "cash", valueIls: 200_000 },
          { type: "loan", valueIls: 120_000, isLiability: true, interestRate: 0, monthlyPayment: 10_000 },
        ],
      })
    );
    expect(r.debtNow).toBe(120_000);
    expect(r.rows[0]?.debt).toBe(120_000);
    expect(r.rows[1]?.debtPayment).toBe(120_000);
    expect(r.rows[1]?.debt).toBe(0);
    expect(r.rows[2]?.debtPayment).toBe(0);
  });

  it("applies a one-off life event in its year", () => {
    const r = simulateLifetime(
      base({ events: [{ year: 2027, amount: -200_000, monthlyChange: 0 }] })
    );
    expect(r.rows.find((row) => row.year === 2028)?.liquid).toBeCloseTo(40_000);
  });

  it("spends less after retirement when retirementSpendPct is set", () => {
    const r = simulateLifetime(
      base({
        retirementAge: 40,
        monthlyIncome: 0,
        retirementSpendPct: 0.5,
        assets: [{ type: "cash", valueIls: 100_000 }],
      })
    );
    expect(r.ranOutAge).toBe(41);
  });
});
