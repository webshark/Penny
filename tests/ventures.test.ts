import { describe, expect, it } from "vitest";
import { parseVentures, ventureSummary, type Venture } from "@/lib/ventures";

const d = (o: Partial<Venture>): Venture => ({ id: "x", name: "Deal", platform: "AngelList", principal: 1000, entryFee: 0, date: "2024-01-01", status: "outstanding", proceeds: 0, ...o });

describe("ventures", () => {
  it("sums invested with fees, outstanding principal, and realized results", () => {
    const s = ventureSummary([d({ principal: 30000, entryFee: 500 }), d({ principal: 15000, status: "written_off" }), d({ principal: 25000, status: "exited", proceeds: 40000 })]);
    expect(s).toEqual({ invested: 70500, outstanding: 30000, realized: 15000 - 15000, count: 3 });
  });

  it("drops malformed deals", () => {
    expect(parseVentures([d({}), d({ principal: 0 }), d({ status: "weird" as never }), d({ date: "2024" }), d({ name: "" }), null])).toHaveLength(1);
    expect(parseVentures({})).toEqual([]);
  });
});
