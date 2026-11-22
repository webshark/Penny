import { describe, expect, it } from "vitest";
import { amortizationSchedule, monthsFrom, refinanceCheck, referenceRate, weightedRate } from "@/lib/loans";

describe("amortizationSchedule", () => {
  it("pays the loan to zero and principal sums to the balance", () => {
    const rows = amortizationSchedule(100_000, 5, 1_888); // just under 5 years
    expect(rows).toHaveLength(5);
    expect(rows.at(-1)!.balance).toBeCloseTo(0, 1);
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBeCloseTo(100_000, 0);
    expect(rows[0].interest).toBeGreaterThan(rows[4].interest);
  });
  it("is empty when the payment does not cover interest", () => {
    expect(amortizationSchedule(100_000, 12, 1_000)).toEqual([]);
  });
});

describe("refinanceCheck", () => {
  it("a lower rate with the same payment saves months and interest", () => {
    const r = refinanceCheck(500_000, 6, 4_000, 4.25)!;
    expect(r.monthsSaved).toBeGreaterThan(0);
    expect(r.interestSaved).toBeGreaterThan(0);
  });
  it("null when the current payment never ends", () => {
    expect(refinanceCheck(500_000, 10, 4_000, 4)).toBeNull();
  });
  it("reference rates follow prime", () => {
    expect(referenceRate("mortgage")).toBe(4.25);
    expect(referenceRate("loan")).toBe(6.75);
  });
});

describe("loan summary helpers", () => {
  it("adds months across years", () => {
    expect(monthsFrom("2026-11-21", 14)).toBe("2028-01");
    expect(monthsFrom("2026-11-21", 0)).toBe("2026-11");
  });
  it("weights rates by balance and skips loans without one", () => {
    expect(weightedRate([{ balance: -300, rate: 2 }, { balance: 100, rate: 10 }, { balance: 50, rate: null }])).toBe(4);
    expect(weightedRate([])).toBeNull();
  });
});
