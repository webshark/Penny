import { describe, expect, it } from "vitest";
import { balanceDrift } from "@/lib/balance-drift";

const prev = { balance: 10_000, day: "2026-11-10" };
const tx = (day: string, amount: number, status = "completed") => ({ day, amount, status });

describe("balanceDrift", () => {
  it("is zero when the transactions explain the change", () => {
    expect(balanceDrift(prev, 9_300, [tx("2026-11-05", -50), tx("2026-11-11", -1_200), tx("2026-11-12", 500)], "2026-11-12", "2026-11-01")).toBe(0);
  });
  it("shows the gap when a transaction is missing", () => {
    expect(balanceDrift(prev, 9_000, [tx("2026-11-11", -700)], "2026-11-12", "2026-11-01")).toBe(-300);
  });
  it("refuses to guess", () => {
    expect(balanceDrift(null, 1, [], "2026-11-12", "2026-11-01")).toBeNull();
    expect(balanceDrift(prev, 1, [], "2026-11-10", "2026-11-01")).toBeNull(); // same day
    expect(balanceDrift(prev, 1, [tx("2026-11-10", -5)], "2026-11-12", "2026-11-01")).toBeNull(); // on the earlier sync's day
    expect(balanceDrift(prev, 1, [tx("2026-11-11", -5, "pending")], "2026-11-12", "2026-11-01")).toBeNull();
    expect(balanceDrift(prev, 1, [], "2026-11-12", "2026-11-11")).toBeNull(); // window starts after the earlier sync
  });
});
