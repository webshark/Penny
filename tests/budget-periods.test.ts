import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let ws: number;
let categoryId: number;
let otherCategoryId: number;
let db: import("better-sqlite3").Database;
let q: typeof import("@/server/db/queries/budget-periods");
const startDay = 10;
const oct = () => q.budgetMonthByKey(startDay, "2026-10");
const nov = () => q.budgetMonthByKey(startDay, "2026-11");

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-budget-"));
  db = (await import("@/server/db/index")).getDb();
  q = await import("@/server/db/queries/budget-periods");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");

  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const categoryIds = (
    db.prepare("SELECT id FROM categories WHERE workspace_id = ? AND kind = 'expense' ORDER BY id LIMIT 2").all(ws) as {
      id: number;
    }[]
  ).map((r) => r.id);
  categoryId = categoryIds[0];
  otherCategoryId = categoryIds[1];
  const cred = db
    .prepare(
      "INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, ?, ?, x'00', x'00', x'00')"
    )
    .run(ws, "hapoalim", "hapoalim").lastInsertRowid as number;
  const run = createSyncRun(ws, "hapoalim", cred, "2026-10-01");
  // 400 spent inside the October period (starts on the 10th).
  insertTransactions(
    ws,
    [
      {
        accountNumber: "B1",
        originalCurrency: "ILS",
        status: "completed" as const,
        originalAmount: -400,
        chargedAmount: -400,
        description: "סופרמרקט",
        date: "2026-10-20",
        processedDate: "2026-10-20",
        type: "normal" as const,
      },
    ],
    "hapoalim",
    cred,
    run
  );
  db.prepare("UPDATE transactions SET category_id = ? WHERE workspace_id = ?").run(categoryId, ws);
});

describe("budget periods", () => {
  it("carries the previous period's leftover into the next one", () => {
    expect(q.setBudgetForPeriod(ws, oct(), startDay, categoryId, 1000)).toBe(true);
    expect(q.setRolloverRule(ws, categoryId, "positive")).toBe(true);

    const { lines, view } = q.getPeriodBudget(ws, nov(), startDay);
    const line = lines.find((l) => l.categoryId === categoryId);
    expect(line?.base).toBe(1000);
    expect(line?.carryIn).toBe(600);
    expect(line?.budget).toBe(1600);
    expect(view.planned).toBe(1600);
  });

  it("edits this period without rewriting history", () => {
    q.setBudgetForPeriod(ws, nov(), startDay, categoryId, 1200);
    const line = q.getPeriodBudget(ws, nov(), startDay).lines.find((l) => l.categoryId === categoryId);
    expect(line?.base).toBe(1200);
    expect(line?.carryIn).toBe(600);
    expect(line?.budget).toBe(1800);

    const history = q.budgetHistory(ws, startDay, "2026-11-15", 3);
    expect(history.map((h) => h.period.key)).toEqual(["2026-11", "2026-10", "2026-09"]);
    const previous = history[1];
    expect(previous.planned).toBe(1000);
    expect(previous.spent).toBe(400);
    expect(previous.leftover).toBe(600);
  });

  it("is idempotent: reading again does not carry the same money twice", () => {
    const first = q.getPeriodBudget(ws, nov(), startDay).view;
    const second = q.getPeriodBudget(ws, nov(), startDay).view;
    expect(second).toEqual(first);
    expect(second.planned).toBe(1800);
  });

  it("removing a budget clears its base and its carry-in", () => {
    expect(q.setBudgetForPeriod(ws, nov(), startDay, categoryId, 0)).toBe(true);
    const line = q.getPeriodBudget(ws, nov(), startDay).lines.find((l) => l.categoryId === categoryId);
    expect(line?.base).toBe(0);
    expect(line?.carryIn).toBe(0);
    expect(line?.budget).toBe(0);
  });

  it("refuses a category from another workspace", () => {
    expect(q.setBudgetForPeriod(ws, nov(), startDay, 999_999, 100)).toBe(false);
  });

  it("counts one-month moves in the period's lines and planned total", async () => {
    const { setBudgetMoves } = await import("@/server/db/queries/budgets");
    q.setBudgetForPeriod(ws, nov(), startDay, categoryId, 500);
    q.setBudgetForPeriod(ws, nov(), startDay, otherCategoryId, 500);
    setBudgetMoves(ws, { "2026-11": [{ from: otherCategoryId, to: categoryId, amount: 200 }] });

    const { lines, view } = q.getPeriodBudget(ws, nov(), startDay);
    expect(lines.find((l) => l.categoryId === categoryId)).toMatchObject({ moves: 200, budget: 700 });
    expect(lines.find((l) => l.categoryId === otherCategoryId)).toMatchObject({ moves: -200, budget: 300 });
    expect(view.planned).toBe(1000);
    // The move is stored on the line, not added again on each read or in the history.
    expect(q.getPeriodBudget(ws, nov(), startDay).view.planned).toBe(1000);
    expect(q.budgetHistory(ws, startDay, "2026-11-15", 1)[0].planned).toBe(1000);

    // Undoing the move takes it off the line.
    setBudgetMoves(ws, {});
    const after = q.getPeriodBudget(ws, nov(), startDay);
    expect(after.lines.find((l) => l.categoryId === categoryId)?.budget).toBe(500);
    expect(after.view.planned).toBe(1000);
  });
});
