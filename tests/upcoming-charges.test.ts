import { describe, expect, it } from "vitest";
import { upcomingCharges } from "@/lib/balance-forecast";

describe("upcomingCharges", () => {
  it("keeps late and soon-due charges, soonest first, and drops the rest", () => {
    const today = "2026-11-21";
    const got = upcomingCharges([
      { name: "soon", cadence: "monthly" as const, lastDate: "2026-10-23" }, // due 11-23
      { name: "late", cadence: "monthly" as const, lastDate: "2026-10-19" }, // due 11-19, not seen yet
      { name: "far", cadence: "monthly" as const, lastDate: "2026-10-30" }, // due 11-30
      { name: "old", cadence: "monthly" as const, lastDate: "2026-10-10" }, // due 11-10, too long ago
      { name: "today", cadence: "weekly" as const, lastDate: "2026-11-14" }, // due 11-21
    ], today);
    expect(got.map((g) => [g.name, g.due, g.overdue])).toEqual([["late", "2026-11-19", true], ["today", "2026-11-21", false], ["soon", "2026-11-23", false]]);
  });
});
