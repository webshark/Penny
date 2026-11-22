import { describe, expect, it } from "vitest";
import { creditUtilization, parseLimits } from "@/lib/credit-utilization";

describe("credit utilization", () => {
  it("uses only cards with a limit for the total, and counts the rest as missing", () => {
    const u = creditUtilization([{ name: "A", owed: -2000 }, { name: "B", owed: 500 }, { name: "C", owed: 100 }], { A: 10000, B: 5000 });
    expect(u.rows.map((r) => r.used)).toEqual([0.2, 0.1, null]);
    expect(u).toMatchObject({ owed: 2500, limit: 15000, missing: 1 });
    expect(u.used).toBeCloseTo(2500 / 15000);
  });

  it("is null overall with no limits", () => {
    expect(creditUtilization([{ name: "A", owed: 1 }], {}).used).toBeNull();
  });

  it("drops bad stored limits", () => {
    expect(parseLimits({ A: 1000, B: 0, C: -5, D: "x", E: Infinity })).toEqual({ A: 1000 });
    expect(parseLimits(null)).toEqual({});
  });
});
