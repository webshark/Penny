import { describe, expect, it } from "vitest";
import { fireVariants } from "@/lib/fi";

describe("fireVariants", () => {
  const base = { monthlySpend: 10_000, savings: 500_000, monthlySaving: 5_000, annualReturn: 0.05, withdrawalRate: 0.04 };
  it("scales the target with the lifestyle and orders the years", () => {
    const v = fireVariants({ ...base, yearsToRetirement: null });
    expect(v.regular.target).toBe(3_000_000);
    expect(v.lean.target).toBeCloseTo(2_100_000);
    expect(v.fat.target).toBe(4_500_000);
    expect(v.lean.years!).toBeLessThan(v.regular.years!);
    expect(v.regular.years!).toBeLessThan(v.fat.years!);
    expect(v.coast).toBeNull();
  });
  it("says whether today's savings coast to the target by retirement", () => {
    const v = fireVariants({ ...base, yearsToRetirement: 40 });
    expect(v.coast!.canStop).toBe(true);
    expect(v.coast!.coastNumber).toBeCloseTo(3_000_000 / 1.05 ** 40);
  });
});
