import { describe, expect, it } from "vitest";
import { holdingFromTrades, parseTradeInput } from "@/lib/holding-trades";

const t = (id: number, date: string, kind: "buy" | "sell", quantity: number, price: number, fee = 0) => ({ id, date, kind, quantity, price, fee });

describe("holdingFromTrades", () => {
  it("averages the cost of buys and realizes gain on a sale", () => {
    const h = holdingFromTrades([t(1, "2026-01-10", "buy", 10, 100, 5), t(2, "2026-03-01", "buy", 10, 120), t(3, "2026-06-01", "sell", 5, 150, 2)]);
    // Cost 2,205 for 20 units = 110.25 each; selling 5 at 150 less 2 fee realizes 5*150-2-5*110.25.
    expect(h.quantity).toBe(15);
    expect(h.costBasis).toBeCloseTo(2205 - 5 * 110.25);
    expect(h.realized).toBeCloseTo(750 - 2 - 551.25);
  });
  it("takes trades in date order and never sells more than is held", () => {
    const h = holdingFromTrades([t(2, "2026-02-01", "sell", 50, 10), t(1, "2026-01-01", "buy", 4, 5)]);
    expect(h.quantity).toBe(0);
    expect(h.costBasis).toBe(0);
    expect(h.realized).toBeCloseTo(4 * 10 - 4 * 5);
  });
});

describe("parseTradeInput", () => {
  it("accepts a clean trade and rejects bad fields", () => {
    expect(parseTradeInput({ date: "2026-05-01", kind: "buy", quantity: "3", price: 12.5 })).toEqual({ date: "2026-05-01", kind: "buy", quantity: 3, price: 12.5, fee: 0, note: null });
    expect(typeof parseTradeInput({ date: "01/05/2026", kind: "buy", quantity: 1, price: 1 })).toBe("string");
    expect(typeof parseTradeInput({ date: "2026-05-01", kind: "gift", quantity: 1, price: 1 })).toBe("string");
    expect(typeof parseTradeInput({ date: "2026-05-01", kind: "sell", quantity: 0, price: 1 })).toBe("string");
  });
});
