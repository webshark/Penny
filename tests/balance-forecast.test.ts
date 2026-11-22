import { describe, expect, it } from "vitest";
import { chargesBetween, forecastBalance, projectAccounts, sizeTier } from "@/lib/balance-forecast";

describe("forecastBalance", () => {
  const base = { today: "2026-11-05", payday: 10, monthlyIncome: 10_000, days: 90 };

  it("adds salary, subtracts bills and recurring debits, finds the low point", () => {
    const f = forecastBalance({
      ...base,
      bank: 3_000,
      bills: [{ date: "2026-11-08", total: 2_500 }, { date: "2026-12-08", total: 9_000 }],
      recurring: [{ cadence: "monthly", lastDate: "2026-10-01", amount: 1_000 }],
    });
    expect(f.points).toHaveLength(91);
    expect(f.points[0]).toEqual({ date: "2026-11-05", balance: 3_000 });
    const at = (d: string) => f.points.find((p) => p.date === d)!.balance;
    expect(at("2026-11-08")).toBe(500);
    expect(at("2026-11-10")).toBe(10_500);
    expect(at("2026-12-01")).toBe(9_500);
    expect(at("2026-12-08")).toBe(500);
    expect(f.low).toEqual({ date: "2026-11-08", balance: 500 });
    expect(f.firstNegative).toBeNull();
    expect(f.nextPayday).toBe("2026-11-10");
  });

  it("reports the first day below zero", () => {
    const f = forecastBalance({ ...base, monthlyIncome: 0, bank: 100, bills: [{ date: "2026-11-20", total: 300 }], recurring: [] });
    expect(f.firstNegative).toBe("2026-11-20");
    expect(f.low.balance).toBe(-200);
    expect(f.nextPayday).toBeNull();
  });

  it("clamps monthly dates to short months", () => {
    expect(chargesBetween("monthly", "2026-01-31", "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(chargesBetween("weekly", "2026-11-01", "2026-11-02", "2026-11-15")).toEqual(["2026-11-08", "2026-11-15"]);
  });
});

describe("sizeTier", () => {
  it("splits the month's charges into thirds", () => {
    const tier = sizeTier([10, 20, 30, 100, 200, 300]);
    expect([10, 20, 30, 100, 200, 300].map(tier)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it("keeps equal charges in one tier", () => {
    expect([50, 50, 50].map(sizeTier([50, 50, 50]))).toEqual([0, 0, 0]);
  });
});

describe("projectAccounts", () => {
  const base = {
    today: "2026-11-05",
    accounts: [
      { account: "A", name: "Bank A", provider: "hapoalim", balance: 3_000 },
      { account: "B", name: "Bank B", provider: "leumi", balance: 500 },
    ],
    events: [
      { date: "2026-11-08", account: "A", name: "card", amount: -2_500, kind: "card" as const, estimated: true },
      { date: "2026-11-10", account: "A", name: "salary", amount: 10_000, kind: "income" as const },
      { date: "2026-11-06", account: "B", name: "rent", amount: -100, kind: "recurring" as const },
    ],
    days: 10,
  };

  it("projects each account on its own and adds them into a total", () => {
    const f = projectAccounts(base);
    const a = f.accounts.find((x) => x.account === "A")!;
    const b = f.accounts.find((x) => x.account === "B")!;
    const at = (points: { date: string; expected: number }[], d: string) => points.find((p) => p.date === d)!.expected;
    expect(a.points).toHaveLength(11);
    expect(at(a.points, "2026-11-08")).toBe(500);
    expect(at(a.points, "2026-11-10")).toBe(10_500);
    expect(at(b.points, "2026-11-08")).toBe(400);
    expect(at(f.total.points, "2026-11-08")).toBe(900);
    expect(at(f.total.points, "2026-11-10")).toBe(10_900);
    expect(f.total.startBalance).toBe(3_500);
  });

  it("widens the band for estimated events and shows the low/high case", () => {
    const f = projectAccounts(base);
    const a = f.accounts.find((x) => x.account === "A")!;
    const point = a.points.find((p) => p.date === "2026-11-08")!;
    expect(point.low).toBe(250);
    expect(point.high).toBe(750);
  });

  it("takes everyday spending out every day, and widens that band too", () => {
    const f = projectAccounts({
      today: "2026-11-05",
      accounts: [{ account: "A", name: "Bank A", provider: "hapoalim", balance: 100, dailyRate: 10 }],
      events: [],
      days: 3,
    });
    expect(f.accounts[0].points.map((p) => p.expected)).toEqual([100, 90, 80, 70]);
    expect(f.accounts[0].points.map((p) => p.low)).toEqual([100, 87, 74, 61]);
    expect(f.accounts[0].points.map((p) => p.high)).toEqual([100, 93, 86, 79]);
    expect(f.accounts[0].dailyRate).toBe(10);
  });

  it("reports the shortfall against the buffer and the day it is first needed", () => {
    const f = projectAccounts({ ...base, buffer: 600 });
    const a = f.accounts.find((x) => x.account === "A")!;
    expect(a.lowest).toEqual({ date: "2026-11-08", amount: 500 });
    expect(a.shortfall).toEqual({ amount: 100, by: "2026-11-08" });
    expect(f.warnings.map((w) => w.account)).toEqual(["A", "B"]);
  });

  it("marks a balance stale when it is more than three days old or never synced", () => {
    const f = projectAccounts({
      today: "2026-11-05",
      accounts: [
        { account: "A", name: "A", provider: "hapoalim", balance: 100, balanceDate: "2026-11-04" },
        { account: "B", name: "B", provider: "leumi", balance: 100, balanceDate: "2026-10-01" },
        { account: "C", name: "C", provider: "discount", balance: 100 },
      ],
      events: [],
      days: 1,
    });
    expect(f.accounts.map((a) => a.stale)).toEqual([false, true, true]);
  });
});
