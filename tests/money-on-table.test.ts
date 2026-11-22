import { describe, expect, it } from "vitest";
import { fundFeeGap, moneyOnTable } from "@/lib/money-on-table";
import type { Suggestion } from "@/lib/suggestions";

const fund = { id: 1, name: "קרן השתלמות", type: "study_fund", valueIls: 200_000, monthlyDeposit: 1_500, feeDeposit: 0, feeBalance: 1.1 };

describe("moneyOnTable", () => {
  it("prices a fund's fee above the benchmark for this year", () => {
    expect(fundFeeGap(fund)).toBe(1000); // (1.1 - 0.6)% of 200k
    expect(fundFeeGap({ ...fund, type: "pension", feeDeposit: 2, feeBalance: 0.22 })).toBe(180); // 1% of 18k deposits
    expect(fundFeeGap({ ...fund, type: "stock" })).toBe(0);
  });

  it("sums suggestions, funds and overlapping insurance, biggest first, and leaves out what was done", () => {
    const suggestions: Suggestion[] = [
      { key: "fees", type: "fees", yearly: 480, count: 12 },
      { key: "leak:x", type: "leak", name: "קפה", count: 20, monthly: 100 },
      { key: "tax:2024", type: "taxRefund", year: 2024, reason: "twoEmployers", payers: 2, months: 12 },
      { key: "rule:y", type: "rule", merchant: "y", categoryId: 1, categoryName: "Food", count: 3 },
    ];
    const policies = [
      { name: "בריאות א", kind: "health" as const, insured: "", monthlyPremium: 90 },
      { name: "בריאות ב", kind: "health" as const, insured: "", monthlyPremium: 60 },
    ];
    const r = moneyOnTable({ suggestions, assets: [fund], policies, done: [{ key: "fees", yearly: 480 }] });
    expect(r.items.map((i) => [i.kind, i.yearly])).toEqual([["leak", 1200], ["fundFee", 1000], ["insurance", 720], ["taxRefund", null]]);
    expect(r.total).toBe(2920);
    expect(r.saved).toBe(480);
  });

  it("prices an overlap from that person's policies of that kind only", () => {
    const policies = [
      { name: "כלל", kind: "health" as const, insured: "דנה", monthlyPremium: 120 },
      { name: "הראל", kind: "health" as const, insured: "דנה", monthlyPremium: 100 },
      { name: "מכבי שלי", kind: "shaban" as const, insured: "דנה", monthlyPremium: 30 },
      { name: "הראל", kind: "travel" as const, insured: "יוסי", monthlyPremium: 5 },
      { name: "הראל", kind: "travel" as const, insured: "יוסי", monthlyPremium: 6 },
    ];
    const r = moneyOnTable({ suggestions: [], assets: [], policies, done: [] });
    const by = (key: string) => r.items.find((i) => i.key.startsWith(key))?.yearly;
    expect(by("insurance:health:")).toBe(1200);
    expect(by("insurance:shaban:")).toBe(360);
    expect(by("insurance:same:travel")).toBe(60);
  });

  it("gives life cover overlaps no figure, since life cover legitimately adds up", () => {
    const policies = [
      { name: "ריסק 1", kind: "life" as const, insured: "", monthlyPremium: 50 },
      { name: "ריסק 2", kind: "life" as const, insured: "", monthlyPremium: 70 },
    ];
    expect(moneyOnTable({ suggestions: [], assets: [], policies, done: [] }).items[0].yearly).toBeNull();
  });

  it("offers the 35% donation credit for last tax year, above the minimum", () => {
    const base = { suggestions: [], assets: [], policies: [], done: [], today: "2026-11-21" };
    const r = moneyOnTable({ ...base, donations: [{ year: 2025, total: 1_800 }, { year: 2026, total: 900 }] });
    expect(r.items).toEqual([expect.objectContaining({ key: "donation:2025", kind: "donationCredit", yearly: 630, name: "2025" })]);
    expect(moneyOnTable({ ...base, donations: [{ year: 2025, total: 150 }] }).items).toEqual([]);
  });
});
