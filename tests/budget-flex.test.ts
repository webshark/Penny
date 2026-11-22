import { describe, expect, it } from "vitest";
import { moveTarget, parseMoves, roomToMove } from "@/lib/budget-moves";
import { percentile, smoothIncome, variesALot } from "@/lib/smoothing";
import { monthlyToClear, overdraftCost, overdraftDepth, shouldShowOverdraft } from "@/lib/overdraft";
import type { CategoryWithData } from "@/lib/types";

const row = (id: number, budget: number, spent: number, extra: Partial<CategoryWithData> = {}): CategoryWithData => ({
  categoryId: id, parentId: null, parentName: null, isParent: false, budgetSource: "leaf", categoryName: `c${id}`,
  categoryColor: "#888888", categoryIcon: null, budgetMode: "budgeted", spent, transactionCount: 1, topMerchant: null,
  budget, isAutoBudget: false, vsLastMonth: null, remaining: Math.max(0, budget - spent), perDayRemaining: null,
  percentSpent: budget ? (spent / budget) * 100 : 0, status: spent > budget ? "over" : "on-track", needsReviewCount: 0, vsTypical: null,
  ...extra,
} as CategoryWithData);

describe("budget moves", () => {
  it("parses only valid months and moves", () => {
    expect(parseMoves({ "2026-11": [{ from: 1, to: 2, amount: 50 }, { from: 1, to: 1, amount: 5 }, { from: 1, to: 2, amount: -3 }], bad: [] }))
      .toEqual({ "2026-11": [{ from: 1, to: 2, amount: 50 }] });
    expect(parseMoves(null)).toEqual({});
  });

  it("lists room most-first and skips rollup parents", () => {
    const rows = [row(1, 500, 600), row(2, 300, 100), row(3, 1000, 100), row(9, 900, 0, { isParent: true, budgetSource: "rollup" })];
    expect(roomToMove(rows, 1).map((r) => r.categoryId)).toEqual([3, 2]);
    expect(moveTarget(rows[0], rows)).toBe(rows[0]);
    expect(moveTarget(rows[1], rows)).toBeNull();
    const fam = [row(9, 900, 1000, { isParent: true, budgetSource: "rollup" }), row(1, 400, 450, { parentId: 9 }), row(2, 500, 550, { parentId: 9 })];
    expect(moveTarget(fam[0], fam)?.categoryId).toBe(1);
  });
});

describe("income smoothing", () => {
  it("percentile interpolates", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentile([10, 20], 0.5)).toBe(15);
  });

  it("detects variation over 30%", () => {
    expect(variesALot([10000, 10000, 10500])).toBe(false);
    expect(variesALot([5000, 10000, 15000])).toBe(true);
  });

  it("suggests a conservative steady amount and this month's status", () => {
    const s = smoothIncome([8000, 12000, 15000, 6000, 20000], 18000, "freelancer")!;
    expect(s.steady).toBe(8000);
    expect(s.bufferTarget).toBe(24000);
    expect(s.thisMonth).toEqual({ kind: "save", amount: 10000 });
    expect(smoothIncome([8000, 12000, 15000], 5000, null)!.thisMonth).toEqual({ kind: "draw", amount: 5000 });
  });

  it("stays quiet for steady salaries or thin history", () => {
    expect(smoothIncome([10000, 10000, 10200], 10000, "salaried")).toBeNull();
    expect(smoothIncome([5000, 15000], 0, "freelancer")).toBeNull();
  });
});

describe("overdraft", () => {
  it("sums interest and months in the last year", () => {
    const c = overdraftCost([
      { date: "2026-10-31", description: "ריבית חובה", amount: -42 },
      { date: "2026-09-30", description: "ריבית על יתרת חובה", amount: -38 },
      { date: "2026-09-15", description: "ריבית חובה", amount: -5 },
      { date: "2025-10-31", description: "ריבית חובה", amount: -99 },
      { date: "2026-10-01", description: "סופר", amount: -300 },
    ], "2026-11-06");
    expect(c).toEqual({ yearlyInterest: 85, monthsInOverdraft: 2 });
  });

  it("depth, monthly plan and visibility", () => {
    expect(overdraftDepth(-3000, -4200)).toBe(4200);
    expect(overdraftDepth(500, null)).toBe(0);
    expect(monthlyToClear(4200, 6)).toBe(700);
    expect(monthlyToClear(1000, 3)).toBe(350);
    expect(monthlyToClear(0, 3)).toBe(0);
    expect(shouldShowOverdraft({ yearlyInterest: 0, monthsInOverdraft: 0 }, 100)).toBe(false);
    expect(shouldShowOverdraft({ yearlyInterest: 0, monthsInOverdraft: 0 }, -1)).toBe(true);
  });
});
