import { describe, expect, it } from "vitest";
import { netWorthDrivers } from "@/lib/net-worth-drivers";

describe("netWorthDrivers", () => {
  it("splits each month's change into savings and the rest, using each month's last point", () => {
    const got = netWorthDrivers(
      [{ date: "2026-09-30", netWorth: 1000 }, { date: "2026-10-10", netWorth: 1100 }, { date: "2026-10-31", netWorth: 1500 }, { date: "2026-11-30", netWorth: 1400 }],
      { "2026-10": 300, "2026-11": 200 },
    );
    expect(got).toEqual([
      { month: "2026-10", change: 500, saved: 300, market: 200 },
      { month: "2026-11", change: -100, saved: 200, market: -300 },
    ]);
  });

  it("needs two months to say anything", () => {
    expect(netWorthDrivers([{ date: "2026-11-01", netWorth: 5 }], {})).toEqual([]);
  });
});
