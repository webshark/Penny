import { describe, expect, it } from "vitest";
import { splitGain } from "@/lib/holding-gain";

describe("splitGain", () => {
  it("separates the price move from the exchange-rate move", () => {
    // Bought $1,000 at ₪3.40; now worth $1,200 at ₪3.70.
    const g = splitGain(1200 * 3.7, 1000, 3.7, 3.4);
    expect(g.price).toBeCloseTo(740);
    expect(g.fx).toBeCloseTo(300);
    expect(g.total).toBeCloseTo(1200 * 3.7 - 3400);
  });
  it("keeps today's rate when the purchase rate is unknown", () => {
    expect(splitGain(4440, 1000, 3.7, null)).toEqual({ total: 740, price: 740, fx: null });
  });
});
