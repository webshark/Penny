import { describe, expect, it } from "vitest";
import { budgetMetrics, DEFAULT_STUDIO, distributionCategories, parseStudioPreferences } from "@/lib/budget-studio";
import type { CategoryWithData } from "@/lib/types";

describe("budget studio preferences", () => {
  it("recovers from malformed or older stored preferences", () => {
    for (const raw of [null, "{broken", "null", "[]"]) expect(parseStudioPreferences(raw)).toEqual(DEFAULT_STUDIO);
    expect(parseStudioPreferences('{"theme":"midnight","chart":"unknown","showChart":false,"motion":"false"}'))
      .toEqual({ ...DEFAULT_STUDIO, theme: "midnight", showChart: false });
  });
});
describe("budget studio figures", () => {
  const now = new Date(2026, 10, 6);
  it("includes today in the daily allowance and preserves overspending", () => {
    expect(budgetMetrics(12000, 1500, now, now).daily).toBe(420);
    const over = budgetMetrics(1000, 1500, now, now);
    expect(over.remaining).toBe(-500);
    expect(over.daily).toBe(0);
    expect(over.used).toBe(150);
  });
  it("never projects a daily allowance or forecast for historical or future months", () => {
    for (const selected of [new Date(2026, 9, 1), new Date(2026, 11, 1)]) {
      const result = budgetMetrics(12000, 1500, selected, now);
      expect(result.daily).toBeNull();
      expect(result.forecast).toBeNull();
    }
  });
  it("waits for five days of observations before projecting", () => {
    expect(budgetMetrics(12000, 100, new Date(2026, 10, 2), new Date(2026, 10, 2)).forecast).toBeNull();
    expect(budgetMetrics(12000, 1500, now, now).forecast).toBe(7500);
  });
  it("handles leap years and absent budgets", () => {
    const leap = new Date(2028, 1, 28);
    expect(budgetMetrics(1000, 600, leap, leap).daily).toBe(200);
    expect(budgetMetrics(0, 600, now, now).daily).toBeNull();
  });
  it("counts parent rollups once and retains standalone categories", () => {
    const rows = [
      { categoryId: 1, isParent: true, parentId: null, spent: 500 },
      { categoryId: 2, isParent: false, parentId: 1, spent: 300 },
      { categoryId: 3, isParent: false, parentId: 1, spent: 200 },
      { categoryId: 4, isParent: false, parentId: null, spent: 100 },
      { categoryId: 5, isParent: false, parentId: 9, spent: 50 },
    ] as CategoryWithData[];
    expect(distributionCategories(rows).map((c) => c.categoryId)).toEqual([1, 4, 5]);
  });
});

it("opens the retired see-through look as light, and ignores accent and custom colour", () => {
  const p = parseStudioPreferences(JSON.stringify({ theme: "glass", accent: "rose", customColor: "#ff0000" }));
  expect(p).toMatchObject({ theme: "pearl", accent: "violet", customColor: null });
});
