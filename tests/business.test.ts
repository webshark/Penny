import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let getDb: typeof import("@/server/db/index").getDb;
let createManualTransaction: typeof import("@/server/db/queries/manual-transactions").createManualTransaction;
let getBusinessReport: typeof import("@/server/db/queries/business").getBusinessReport;
let getPeriodTotal: typeof import("@/server/db/queries/transactions").getPeriodTotal;
let ensureCategory: typeof import("@/server/db/queries/categories").ensureCategory;
let ws = 1;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-business-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ createManualTransaction } = await import("@/server/db/queries/manual-transactions"));
  ({ getBusinessReport } = await import("@/server/db/queries/business"));
  ({ getPeriodTotal } = await import("@/server/db/queries/transactions"));
  ({ ensureCategory } = await import("@/server/db/queries/categories"));
  ws = (getDb().prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as { id: number }).id;
});

describe("business report", () => {
  it("reports only the business share and leaves the rest to the household", () => {
    const category = ensureCategory(ws, "ציוד משרדי", undefined, "expense");
    createManualTransaction(
      getDb(),
      ws,
      { kind: "expense", amount: 200, date: "2026-01-10", description: "Adobe", categoryId: category.id, account: "cash", businessSharePct: 50 },
      [],
    );
    createManualTransaction(
      getDb(),
      ws,
      { kind: "expense", amount: 100, date: "2026-01-11", description: "סופר", categoryId: category.id, account: "cash" },
      [],
    );

    const report = getBusinessReport(ws, "2026-01-01", "2026-12-31");
    expect(report.expenses).toBe(100);
    expect(report.businessTransactions).toBe(1);
    expect(report.months).toEqual([{ month: "2026-01", expenses: 100, income: 0, net: -100 }]);
    expect(report.categories[0]).toMatchObject({ name: "ציוד משרדי", expenses: 100, count: 1 });
    expect(report.rows[0]).toMatchObject({ description: "Adobe", charged: -200, business: -100, pct: 50 });

    // The household total keeps both rows at their personal amount: 100 + 100.
    expect(getPeriodTotal(ws, "2026-01-01", "2026-12-31")).toBe(200);
  });

  it("counts a business income row as income, not as a negative expense", () => {
    createManualTransaction(
      getDb(),
      ws,
      { kind: "income", amount: 1000, date: "2026-02-01", description: "לקוח", account: "cash", businessSharePct: 100 },
      [],
    );
    const report = getBusinessReport(ws, "2026-02-01", "2026-02-28");
    expect(report.income).toBe(1000);
    expect(report.expenses).toBe(0);
    expect(report.months[0]).toEqual({ month: "2026-02", expenses: 0, income: 1000, net: 1000 });
  });

  it("is empty when nothing carries a business share", () => {
    const report = getBusinessReport(ws, "2025-01-01", "2025-01-31");
    expect(report).toMatchObject({ expenses: 0, income: 0, businessTransactions: 0, months: [], categories: [], merchants: [] });
  });
});
