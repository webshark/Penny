import { it, expect } from "vitest";
import { buildPivot, lastMonths, pivotTotals } from "@/lib/pivot";

it("lists the last months oldest first, across a year boundary", () => {
  expect(lastMonths(3, new Date(2026, 0, 15))).toEqual(["2025-11", "2025-12", "2026-01"]);
});

it("rolls categories up under their group, sorts by total, and keeps ungrouped ones as rows", () => {
  const food = { id: 10, name: "Food", color: "#f00" };
  const parentOf = new Map([[1, food], [2, food]]);
  const rows = buildPivot(["2026-01", "2026-02"], [
    [{ categoryId: 1, name: "Groceries", color: "#a", amount: 100 }, { categoryId: 3, name: "Rent", color: "#b", amount: 500 }],
    [{ categoryId: 1, name: "Groceries", color: "#a", amount: 50 }, { categoryId: 2, name: "Bakery", color: "#c", amount: 30 }],
  ], parentOf);
  expect(rows.map((r) => r.name)).toEqual(["Rent", "Food"]);
  const f = rows[1];
  expect(f.amounts).toEqual([100, 80]);
  expect(f.total).toBe(180);
  expect(f.average).toBe(90);
  expect(f.children.map((c) => [c.name, c.amounts])).toEqual([["Groceries", [100, 50]], ["Bakery", [0, 30]]]);
  expect(pivotTotals(rows, 2)).toEqual([600, 80]);
});
