import { describe, expect, it } from "vitest";
import { accountGroupOf, groupAccounts } from "@/lib/account-groups";
import type { Asset } from "@/lib/types";

const a = (id: number, type: string, valueIls: number | null, extra: Partial<Asset> = {}) =>
  ({ id, name: `a${id}`, type, valueIls, isLiability: false, ...extra }) as Asset;

describe("account groups", () => {
  it("sorts each kind into its group", () => {
    expect(accountGroupOf(a(1, "other", 0, { source: "bank" }))).toBe("bank");
    expect(accountGroupOf(a(2, "pension", 0))).toBe("investments");
    expect(accountGroupOf(a(3, "real_estate", 0))).toBe("property");
    expect(accountGroupOf(a(4, "vehicle", 0))).toBe("vehicles");
    expect(accountGroupOf(a(5, "mortgage", 0, { isLiability: true }))).toBe("liabilities");
  });

  it("totals groups, makes debts negative, drops empty groups", () => {
    const g = groupAccounts([a(1, "cash", 100), a(2, "deposit", 300), a(3, "loan", 50, { isLiability: true }), a(4, "stock", null)]);
    expect(g.map((x) => x.key)).toEqual(["bank", "investments", "liabilities"]);
    expect(g[0]).toMatchObject({ total: 400, items: [{ id: 2 }, { id: 1 }] });
    expect(g[2].total).toBe(-50);
    expect(g[1].total).toBe(0);
  });

  it("moves an account to a chosen group, but never turns an asset into a debt or a debt into an asset", () => {
    const g = groupAccounts([a(1, "cash", 100), a(2, "deposit", 50), a(3, "loan", 20, { isLiability: true })], { 1: "investments", 2: "liabilities", 3: "bank" });
    expect(g.map((x) => [x.key, x.items.map((i) => i.id)])).toEqual([["bank", [2]], ["investments", [1]], ["liabilities", [3]]]);
  });
});
