import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

/**
 * A "golden" month for a typical Israeli household, with totals worked out by hand. Every money screen reads
 * these same facts, so if a change to the pipeline moves any of them, this test says so.
 */
const txn = (accountNumber: string, description: string, chargedAmount: number, date: string, status: "completed" | "pending" = "completed") => ({
  accountNumber, originalCurrency: "ILS", status, originalAmount: chargedAmount, chargedAmount, description, date, processedDate: date, type: "normal" as const,
});

let ws: number;
let facts: typeof import("@/server/finance/facts");

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-golden-"));
  const db = (await import("@/server/db/index")).getDb();
  facts = await import("@/server/finance/facts");
  const { reconcileFlows } = await import("@/server/finance/pairing");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const cred = (provider: string) =>
    db.prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, ?, ?, x'00', x'00', x'00')").run(ws, provider, provider).lastInsertRowid as number;
  const bank = cred("hapoalim");
  const card = cred("isracard");

  // The card company first, as a sync does when both are connected.
  insertTransactions(ws, [
    txn("C1", "שופרסל", -1_200, "2026-10-03"),
    txn("C1", "פז", -400, "2026-10-10"),
    txn("C1", "נטפליקס", -50, "2026-10-15"),
    txn("C1", "זיכוי שופרסל", 200, "2026-10-20"),
    txn("C1", "רמי לוי", -300, "2026-10-30", "pending"),
  ], "isracard", card, createSyncRun(ws, "isracard", card, "2026-10-01"));

  insertTransactions(ws, [
    txn("B1", "משכורת", 14_000, "2026-10-01"),
    txn("B1", "ישראכרט", -1_450, "2026-10-02"), // last month's card bill: its charges arrive from the card company
    txn("B1", "ועד בית", -250, "2026-10-05"),
    txn("B1", "ארנונה", -600, "2026-10-12"),
    // Banks send Israeli midnight as a UTC instant: this is rent on 1 November, not 31 October.
    txn("B1", "שכר דירה", -5_000, "2026-10-31T22:00:00.000Z"),
  ], "hapoalim", bank, createSyncRun(ws, "hapoalim", bank, "2026-10-01"));

  reconcileFlows(ws);
});

describe("golden month", () => {
  it("counts the salary as income and each shekel of spending once", () => {
    const m = facts.cashBetween(ws, "2026-10-01", "2026-10-31");
    expect(m.income).toBe(14_000);
    // 1,200 + 400 + 50 − 200 refund + 250 + 600. The card bill is not spending again, and the pending charge isn't final.
    expect(m.spend).toBe(2_300);
    expect(m.net).toBe(11_700);
  });

  it("puts a charge on the 1st in its Israeli month", () => {
    expect(facts.cashBetween(ws, "2026-11-01", "2026-11-30").spend).toBe(5_000);
  });

  it("backfills old instant-style dates to Israeli days", async () => {
    const db = (await import("@/server/db/index")).getDb();
    const { toIsraelDays } = await import("@/server/db/migrate");
    const id = db.prepare("SELECT id FROM transactions WHERE description = 'ועד בית'").get() as { id: number };
    db.prepare("UPDATE transactions SET date = '2026-09-30T21:00:00.000Z' WHERE id = ?").run(id.id);
    toIsraelDays(db);
    expect((db.prepare("SELECT date FROM transactions WHERE id = ?").get(id.id) as { date: string }).date).toBe("2026-10-01");
  });
});
