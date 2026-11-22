import { describe, expect, it } from "vitest";
import { creditTrend } from "@/lib/credit-score";

const e = (id: number, date: string, score: number) => ({ id, date, score, bureau: "", note: "" });

describe("creditTrend", () => {
  it("takes the newest score and its change from the previous one", () => {
    const t = creditTrend([e(1, "2025-03-01", 700), e(2, "2026-02-01", 760)], "2026-11-21");
    expect(t.latest?.score).toBe(760);
    expect(t.change).toBe(60);
    expect(t.reportDue).toBe(false);
  });
  it("asks for a new free report after a year or when there is none", () => {
    expect(creditTrend([], "2026-11-21").reportDue).toBe(true);
    expect(creditTrend([e(1, "2025-11-21", 700)], "2026-11-21").reportDue).toBe(true);
    expect(creditTrend([e(1, "2025-11-22", 700)], "2026-11-21").change).toBeNull();
  });
});
