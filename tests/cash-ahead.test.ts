import { describe, expect, it } from "vitest";
import { cashAhead } from "@/lib/cash-ahead";

describe("cashAhead", () => {
  const base = { today: "2026-11-05", payday: 10, bank: 20_000, monthlyIncome: 18_000, incomeSoFar: 0 };

  it("subtracts card bills due before payday", () => {
    const r = cashAhead({ ...base, bills: [{ date: "2026-11-08", total: 7_000 }, { date: "2026-12-08", total: 9_000 }] });
    expect(r).toMatchObject({ until: "2026-11-10", daysLeft: 5, billsDue: 7_000, safeToSpend: 13_000, salaryExpected: 18_000 });
  });

  it("counts a bill dated today until the bank shows it paid", () => {
    const bills = [{ date: "2026-11-05", total: 6_000 }];
    expect(cashAhead({ ...base, bills }).billsDue).toBe(6_000);
    expect(cashAhead({ ...base, bills, billPaidToday: true }).billsDue).toBe(0);
  });

  it("rolls to next month after payday and waits for a bank balance", () => {
    const r = cashAhead({ ...base, today: "2026-11-20", bank: null, bills: [{ date: "2026-12-02", total: 4_000 }] });
    expect(r).toMatchObject({ until: "2026-12-10", billsDue: 4_000, safeToSpend: null, salaryExpected: 0 });
  });
});
