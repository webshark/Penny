import { describe, expect, it } from "vitest";
import { lastCompleteMonth, monthRecap, shiftMonth, yearRecap, type RecapInput } from "@/lib/recap";
import { budgetMonthByKey } from "@/lib/finance-period";

const e = (date: string, amount: number, categoryId: number | null, description = "x") => ({ date, amount, categoryId, description });
const base: RecapInput = {
  categories: [{ id: 1, name: "Food", needType: "need" }, { id: 2, name: "Fun", needType: "want" }],
  income: { "2026-09": 10000, "2026-10": 10000 },
  budgetTotal: 0,
  today: "2026-11-06",
  expenses: [
    e("2026-09-03", 3000, 1), e("2026-09-04", 2000, 2),
    e("2026-10-01", 2500, 1), e("2026-10-02", 1500, 2, "Concert"), e("2026-10-20", 500, 2),
  ],
};

describe("recap", () => {
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(lastCompleteMonth("2026-11-06")).toBe("2026-10");
  });

  it("summarises a month", () => {
    const r = monthRecap("2026-10", base);
    expect(r).toMatchObject({ spent: 4500, prevSpent: 5000, kept: 5500, top: { name: "Food", spent: 2500, prev: 3000 } });
    expect(r.biggest).toMatchObject({ date: "2026-10-01", amount: 2500 });
    // 31 days, 3 with spending; Oct 3–19 is the longest quiet run.
    expect([r.noSpendDays, r.longestStreak, r.daysCounted]).toEqual([28, 17, 31]);
    expect(r.improved).toEqual({ name: "Food", drop: 500 });
    expect(r.trim).toEqual({ name: "Fun", yearly: 2400 });
    expect(r.underBudgetMonths).toBeNull();
  });

  it("counts months in a row under budget", () => {
    expect(monthRecap("2026-10", { ...base, budgetTotal: 4800 }).underBudgetMonths).toBe(1);
    expect(monthRecap("2026-10", { ...base, budgetTotal: 6000 }).underBudgetMonths).toBe(2);
  });

  it("stops counting days at today", () => {
    expect(monthRecap("2026-11", base).daysCounted).toBe(6);
  });

  it("summarises a year", () => {
    const r = yearRecap(2026, base);
    expect(r).toMatchObject({ spent: 9500, income: 20000, kept: 10500, bestMonth: { month: "2026-10", kept: 5500 } });
    expect(r.savingsRate).toBeCloseTo(0.525);
    expect(r.top.map((x) => x.name)).toEqual(["Food", "Fun"]);
    expect(r.daysCounted).toBe(310);
    expect(r.noSpendDays).toBe(305);
  });

  describe("household months", () => {
    // A month that starts on the 10th: key 2026-09 is Sep 10 to Oct 9.
    const periods = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => shiftMonth("2026-01", i)).map((key) => {
        const r = budgetMonthByKey(10, key);
        return [key, { from: r.from, to: r.to }];
      })
    );
    const household: RecapInput = {
      ...base,
      periods,
      income: { "2026-10": 5000 },
      expenses: [e("2026-09-15", 1000, 1), e("2026-10-05", 500, 2), e("2026-10-12", 700, 1), e("2026-11-10", 300, 2)],
    };

    it("uses the period's dates, not the calendar month", () => {
      const r = monthRecap("2026-10", household);
      // Oct 5 belongs to the previous household month; Nov 10 starts the next one.
      expect(r).toMatchObject({ spent: 700, prevSpent: 1500, income: 5000, kept: 4300 });
      expect([r.noSpendDays, r.daysCounted]).toEqual([27, 28]);
    });

    it("buckets a household year by its month keys", () => {
      const r = yearRecap(2026, household);
      expect(r).toMatchObject({ spent: 2500, income: 5000, kept: 2500, bestMonth: { month: "2026-10", kept: 4300 } });
    });
  });
});
