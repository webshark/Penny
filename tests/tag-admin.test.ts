import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let db: ReturnType<typeof import("@/server/db/index").getDb>;
let q: typeof import("@/server/db/queries/transactions");
const tags = (ws: number) => (db.prepare("SELECT transaction_id AS id, tag FROM transaction_tags WHERE workspace_id = ? ORDER BY id, tag").all(ws) as { id: number; tag: string }[]);

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-tags-"));
  db = (await import("@/server/db/index")).getDb();
  q = await import("@/server/db/queries/transactions");
  // Tag rows only; the transactions they point at are not needed for these queries.
  db.pragma("foreign_keys = OFF");
  const add = db.prepare("INSERT INTO transaction_tags (workspace_id, transaction_id, tag) VALUES (?, ?, ?)");
  add.run(1, 1, "trip"); add.run(1, 2, "trip"); add.run(1, 2, "vacation"); add.run(2, 3, "trip");
});

describe("tag admin", () => {
  it("renames a tag and merges into one that already exists, in one workspace only", () => {
    q.renameTag(1, "trip", "vacation");
    expect(tags(1)).toEqual([{ id: 1, tag: "vacation" }, { id: 2, tag: "vacation" }]);
    expect(tags(2)).toEqual([{ id: 3, tag: "trip" }]);
  });

  it("deletes a tag in one workspace only", () => {
    expect(q.deleteTag(1, "vacation")).toBe(2);
    expect(tags(1)).toEqual([]);
    expect(tags(2)).toHaveLength(1);
  });
});

describe("currency usage", () => {
  it("counts assets by currency, upper-cased, in one workspace only", async () => {
    const assets = await import("@/server/db/queries/assets");
    const base = { type: "stock" as const, symbol: null, quantity: null, manualValue: 100, costBasis: null, liquid: true, note: null, feeDeposit: null, feeBalance: null, monthlyDeposit: null, interestRate: null, monthlyPayment: null };
    db.pragma("foreign_keys = OFF");
    assets.createAssets(1, [{ ...base, name: "a", currency: "usd" }, { ...base, name: "b", currency: "USD" }, { ...base, name: "c", currency: "EUR" }]);
    assets.createAssets(2, [{ ...base, name: "d", currency: "GBP" }]);
    expect(q.getCurrencyUsage(1)).toEqual([{ currency: "USD", transactions: 0, assets: 2 }, { currency: "EUR", transactions: 0, assets: 1 }]);
  });
});

