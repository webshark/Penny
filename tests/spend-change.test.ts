import { describe, expect, it } from "vitest";
import { explainChange } from "@/lib/spend-change";

const r = (merchant: string, ...amounts: number[]) => amounts.map((amount) => ({ merchant, amount }));

describe("explainChange", () => {
  it("splits the change into price, volume, new and gone, adding up to the total", () => {
    const before = [...r("netflix", 50), ...r("wolt", 100, 100), ...r("gym", 200)];
    const now = [...r("netflix", 70), ...r("wolt", 100, 100, 100, 100), ...r("ikea", 900)];
    const e = explainChange(before, now);
    expect(e.change).toBe(1370 - 450);
    expect(e.drivers).toEqual([
      { merchant: "ikea", kind: "new", amount: 900 },
      { merchant: "wolt", kind: "more", amount: 200 },
      { merchant: "gym", kind: "gone", amount: -200 },
    ]);
    // Netflix's +20 is below the noise floor and left out.
  });

  it("calls one big charge a one-off, not a price rise", () => {
    const e = explainChange(r("מוסך", 300, 300), r("מוסך", 300, 2400));
    expect(e.drivers[0]).toEqual({ merchant: "מוסך", kind: "oneOff", amount: 2100 });
  });

  it("reports a real price rise", () => {
    const e = explainChange(r("הוט", 150, 150), r("הוט", 230, 230));
    expect(e.drivers).toEqual([{ merchant: "הוט", kind: "price", amount: 160 }]);
  });
});
