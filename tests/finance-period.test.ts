import { describe, it, expect } from "vitest";
import {
  budgetMonthByKey,
  budgetMonthRange,
  carryAmount,
  daysLeft,
  effectiveBudget,
  elapsedPercent,
  isRolloverRule,
  shiftBudgetMonthKey,
} from "@/lib/finance-period";

describe("budgetMonthRange", () => {
  it("uses the previous period before the start day and the current one on it", () => {
    expect(budgetMonthRange(10, "2026-11-05")).toEqual({
      key: "2026-10",
      from: "2026-10-10",
      to: "2026-11-09",
    });
    expect(budgetMonthRange(10, "2026-11-10")).toEqual({
      key: "2026-11",
      from: "2026-11-10",
      to: "2026-12-09",
    });
  });

  it("walks across years in both directions", () => {
    expect(budgetMonthRange(10, "2026-12-15")).toEqual({
      key: "2026-12",
      from: "2026-12-10",
      to: "2027-01-09",
    });
    expect(budgetMonthRange(10, "2026-11-15", -1).key).toBe("2026-10");
    // January 5 still belongs to the December period, so one step back is November.
    expect(budgetMonthRange(10, "2026-01-05").key).toBe("2025-12");
    expect(budgetMonthRange(10, "2026-01-05", -1).key).toBe("2025-11");
  });

  it("ignores a start day that no month has", () => {
    expect(budgetMonthRange(0, "2026-11-01").from).toBe("2026-11-01");
    expect(budgetMonthByKey(31, "2026-02").from).toBe("2026-02-28");
    expect(budgetMonthByKey(31, "2026-02").to).toBe("2026-03-27");
  });
});

describe("budgetMonthByKey", () => {
  it("returns the period that starts in that calendar month", () => {
    expect(budgetMonthByKey(10, "2026-02")).toEqual({
      key: "2026-02",
      from: "2026-02-10",
      to: "2026-03-09",
    });
    expect(budgetMonthByKey(10, "2026-12").to).toBe("2027-01-09");
  });
});

describe("shiftBudgetMonthKey", () => {
  it("shifts month keys without drifting", () => {
    expect(shiftBudgetMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftBudgetMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftBudgetMonthKey("2026-11", -26)).toBe("2024-09");
  });
});

describe("elapsedPercent and daysLeft", () => {
  it("counts the period by its own dates", () => {
    expect(elapsedPercent("2026-10-09", "2026-10-10", "2026-11-09")).toBe(0);
    expect(elapsedPercent("2026-11-09", "2026-10-10", "2026-11-09")).toBe(100);
    expect(elapsedPercent("2026-10-19", "2026-10-10", "2026-11-09")).toBeCloseTo((10 / 31) * 100, 5);
    expect(daysLeft("2026-11-05", "2026-11-09")).toBe(5);
    expect(daysLeft("2026-11-12", "2026-11-09")).toBe(0);
  });
});

describe("carryAmount", () => {
  it("follows the rule and never carries more than one period's budget", () => {
    expect(carryAmount("none", 600, 1000)).toBe(0);
    expect(carryAmount("positive", 600, 1000)).toBe(600);
    expect(carryAmount("positive", -300, 1000)).toBe(0);
    expect(carryAmount("negative", -300, 1000)).toBe(-300);
    expect(carryAmount("negative", 300, 1000)).toBe(0);
    expect(carryAmount("both", -300, 1000)).toBe(-300);
    expect(carryAmount("both", 5000, 1000)).toBe(1000);
    expect(carryAmount("both", -5000, 1000)).toBe(-1000);
    expect(carryAmount("both", 300, 0)).toBe(0);
  });

  it("rejects unknown rules", () => {
    expect(isRolloverRule("both")).toBe(true);
    expect(isRolloverRule("sometimes")).toBe(false);
    expect(isRolloverRule(null)).toBe(false);
  });
});

describe("effectiveBudget", () => {
  it("adds base, carry-in and moves and never goes below zero", () => {
    expect(effectiveBudget(1000, 600)).toBe(1600);
    expect(effectiveBudget(1000, 0, -200)).toBe(800);
    expect(effectiveBudget(100, 0, -200)).toBe(0);
    expect(effectiveBudget(99.99, 0.01)).toBe(100);
  });
});
