import { describe, it, expect } from "vitest";
import {
  auditSubscriptions,
  daysBetween,
  isPensionStale,
  monthlyCost,
  pensionAgeMonths,
  type RecurringLike,
} from "@/lib/guided-reviews";

const sub = (over: Partial<RecurringLike> = {}): RecurringLike => ({
  merchant: "Netflix",
  cadence: "monthly",
  expectedAmount: -60,
  lastDate: "2026-11-01",
  ...over,
});

describe("monthlyCost", () => {
  it("spreads weekly, monthly and yearly charges over one month", () => {
    expect(monthlyCost(sub())).toBe(60);
    expect(Math.round(monthlyCost(sub({ cadence: "yearly", expectedAmount: -1200 })))).toBe(100);
    expect(Math.round(monthlyCost(sub({ cadence: "weekly", expectedAmount: -70 })))).toBe(303);
  });
});

describe("auditSubscriptions", () => {
  const series = [
    sub({ merchant: "Netflix", expectedAmount: -60, priceChange: { from: 50, to: 60, date: "2026-09-01" } }),
    sub({ merchant: "Gym", expectedAmount: -200, lastDate: "2026-08-01" }),
    sub({ merchant: "Domain", cadence: "yearly", expectedAmount: -120, lastDate: "2026-10-01" }),
  ];

  it("adds the recurring bill up and names the biggest charge", () => {
    const audit = auditSubscriptions(series, "2026-11-18");
    expect(audit.count).toBe(3);
    expect(Math.round(audit.monthly)).toBe(270);
    expect(Math.round(audit.yearly)).toBe(3240);
    expect(audit.biggest).toEqual({ merchant: "Gym", monthly: 200 });
  });

  it("reports price rises and subscriptions that stopped two cycles ago", () => {
    const audit = auditSubscriptions(series, "2026-11-18");
    expect(audit.raised).toEqual([{ merchant: "Netflix", from: 50, to: 60, date: "2026-09-01" }]);
    expect(audit.dormant.map((d) => d.merchant)).toEqual(["Gym"]);
  });

  it("is empty without recurring charges", () => {
    expect(auditSubscriptions([], "2026-11-18")).toEqual({
      count: 0,
      monthly: 0,
      yearly: 0,
      biggest: null,
      raised: [],
      dormant: [],
    });
  });
});

describe("pension report age", () => {
  it("counts whole months since the report", () => {
    expect(pensionAgeMonths("2026-09", "2026-11-18")).toBe(2);
    expect(pensionAgeMonths("2025-03", "2026-11-18")).toBe(20);
    expect(pensionAgeMonths("2027-01", "2026-11-18")).toBe(0);
  });

  it("has no age without a report", () => {
    expect(pensionAgeMonths(null, "2026-11-18")).toBeNull();
    expect(isPensionStale(null)).toBe(false);
  });

  it("calls a report a year old or older stale", () => {
    expect(isPensionStale(pensionAgeMonths("2026-09", "2026-11-18"))).toBe(false);
    expect(isPensionStale(pensionAgeMonths("2025-11", "2026-11-18"))).toBe(true);
  });
});

describe("daysBetween", () => {
  it("ignores a time part and survives junk", () => {
    expect(daysBetween("2026-11-01T23:10:00", "2026-11-18")).toBe(17);
    expect(daysBetween("not a date", "2026-11-18")).toBe(0);
  });
});
