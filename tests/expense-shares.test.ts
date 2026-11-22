import { describe, expect, it } from "vitest";
import { shareBalances } from "@/lib/expense-shares";

describe("shareBalances", () => {
  it("adds up open shares per person, ignoring case and spaces, biggest first", () => {
    const rows = shareBalances([
      { person: "דנה", amount: 100, settledAt: null },
      { person: " דנה ", amount: 50, settledAt: null },
      { person: "Avi", amount: 300, settledAt: null },
      { person: "avi", amount: 999, settledAt: "2026-11-01" },
    ]);
    expect(rows).toEqual([{ person: "Avi", owed: 300, count: 1 }, { person: "דנה", owed: 150, count: 2 }]);
  });
  it("is empty when everyone paid back", () => {
    expect(shareBalances([{ person: "x", amount: 5, settledAt: "2026-01-01" }])).toEqual([]);
  });
});
