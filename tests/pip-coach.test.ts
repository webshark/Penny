import { describe, expect, it } from "vitest";
import { pipGuru, pipInsights, type PipInput } from "@/lib/pip-coach";

const fmt = (n: number) => `₪${Math.round(n)}`;
const base: PipInput = { fmt };

describe("Pip's reading of the month", () => {
  it("puts money going wrong first: an overdrawn bank before everything else", () => {
    const list = pipInsights({
      ...base,
      cash: { safeToSpend: 900, billsDue: 200, daysLeft: 5, bank: -1200 },
      month: { spent: 100, budget: 1000, elapsed: 0.5 },
    });
    expect(list[0]).toMatchObject({ key: "bankNegative", tone: "act", vars: { amount: "₪1200" } });
    expect(list.some((l) => l.key === "paceOn")).toBe(true);
  });

  it("flags spending ahead of the calendar, and stays quiet when it is behind", () => {
    const over = pipInsights({ ...base, month: { spent: 800, budget: 1000, elapsed: 0.5 } });
    expect(over.find((l) => l.key === "paceOver")).toMatchObject({ tone: "watch", vars: { used: 80, elapsed: 50 } });
    const on = pipInsights({ ...base, month: { spent: 400, budget: 1000, elapsed: 0.5 } });
    expect(on.find((l) => l.key === "paceOn")?.tone).toBe("good");
    // No budget set: no pace line at all, rather than a made-up one.
    expect(pipInsights({ ...base, month: { spent: 400, budget: 0, elapsed: 0.5 } })).toHaveLength(0);
  });

  it("reports a category that moved, but ignores noise below 20% (and small sums)", () => {
    expect(pipInsights({ ...base, mover: { name: "מזון", spent: 600, previous: 400 } }).find((l) => l.key === "moverUp"))
      .toMatchObject({ tone: "watch", vars: { name: "מזון", amount: "₪200" } });
    expect(pipInsights({ ...base, mover: { name: "מזון", spent: 460, previous: 400 } }).some((l) => l.key === "moverUp")).toBe(false);
    expect(pipInsights({ ...base, mover: { name: "מזון", spent: 100, previous: 200 } }).find((l) => l.key === "moverDown"))
      .toMatchObject({ tone: "good", vars: { amount: "₪100" } });
  });

  it("says when bills do not fit in the money left before payday", () => {
    const list = pipInsights({ ...base, cash: { safeToSpend: 300, billsDue: 900, daysLeft: 4, bank: null } });
    expect(list[0]).toMatchObject({ key: "billsOverSafe", tone: "act", vars: { bills: "₪900", safe: "₪300" } });
  });

  it("lists action first, then watches, then good news", () => {
    const list = pipInsights({
      ...base,
      month: { spent: 500, budget: 1000, elapsed: 0.5 },
      flow: { income: 10_000, expenses: 8_000, previousExpenses: 7_000, savingsRate: 0.2, uncategorized: 120 },
      cash: { safeToSpend: 100, billsDue: 400, daysLeft: 3, bank: null },
    });
    expect(list[0].tone).toBe("act");
    expect(list.at(-1)?.tone).toBe("good");
    expect(list.find((l) => l.key === "uncategorized")?.vars).toEqual({ amount: "₪120" });
  });

  it("names the next charge when the forecast has one", () => {
    const list = pipInsights({ ...base, nextBill: { amount: 640, days: 6 } });
    expect(list.find((l) => l.key === "nextBill")).toMatchObject({ vars: { amount: "₪640", days: 6 } });
  });

  it("advises on the weakest link, in money terms", () => {
    expect(pipGuru("emergency", { ...base, runway: { months: 1.5, target: 6 } }))
      .toMatchObject({ key: "guru_emergency", vars: { months: 4.5, target: 6 } });
    expect(pipGuru("savings", { ...base, flow: { income: 10_000, expenses: 9_000, previousExpenses: 0, savingsRate: 0.1, uncategorized: 0 } }).vars)
      .toEqual({ amount: "₪1200" });
    expect(pipGuru("debt", base).tone).toBe("act");
    expect(pipGuru(null, base)).toMatchObject({ key: "guru_steady", tone: "good" });
  });
});
