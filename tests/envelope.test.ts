import { describe, expect, it } from "vitest";
import { envelopeBalance } from "@/lib/envelope";

describe("envelopeBalance", () => {
  it("counts leaf budgets only and shows what income is left to assign", () => {
    const cats = [{ isParent: true, budget: 3000 }, { budget: 2000 }, { budget: 1000 }, { budget: 0 }];
    expect(envelopeBalance(10000, cats)).toEqual({ income: 10000, assigned: 3000, unassigned: 7000 });
  });
  it("goes negative when budgets promise more than came in", () => {
    expect(envelopeBalance(1000, [{ budget: 1500 }]).unassigned).toBe(-500);
  });
  it("uses the overall monthly target when no category has a budget", () => {
    expect(envelopeBalance(20000, [{ budget: 0 }], 18000)).toEqual({ income: 20000, assigned: 18000, unassigned: 2000 });
    expect(envelopeBalance(20000, [{ budget: 500 }], 18000).assigned).toBe(500);
  });
});
