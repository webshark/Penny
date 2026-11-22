import { describe, expect, it } from "vitest";
import { ownerClause, runWithOwner } from "@/server/lib/owner-scope";

describe("owner scope", () => {
  it("adds nothing outside a scoped request", () => {
    expect(ownerClause("t")).toEqual({ sql: "", params: [] });
  });

  it("matches the row's owner, or the account's default when the row has none, and survives awaits", async () => {
    const got = await runWithOwner({ id: "dana", accounts: ["0001", "0002"] }, async () => {
      await Promise.resolve();
      return ownerClause("t");
    });
    expect(got.sql).toBe(" AND (t.owner = ? OR (t.owner IS NULL AND t.account_number IN (?,?)))");
    expect(got.params).toEqual(["dana", "0001", "0002"]);
  });

  it("matches only explicitly owned rows when the member owns no accounts", () => {
    const got = runWithOwner({ id: "noa", accounts: [] }, () => ownerClause());
    expect(got.sql).toContain("account_number IN (NULL)");
    expect(got.params).toEqual(["noa"]);
  });
});
