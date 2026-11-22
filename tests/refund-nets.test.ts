import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let db: ReturnType<typeof import("@/server/db/index").getDb>;
let q: typeof import("@/server/db/queries/transactions");
let home: typeof import("@/server/db/queries/home");
let ws: number, cred: number, run: number;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-refund-"));
  db = (await import("@/server/db/index")).getDb();
  q = await import("@/server/db/queries/transactions");
  home = await import("@/server/db/queries/home");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  cred = db
    .prepare(
      "INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')"
    )
    .run(ws).lastInsertRowid as number;
  run = createSyncRun(ws, "isracard", cred, "2026-10-01");
});

// A card charge is stored negative and a refund positive, as the scrapers report them.
const cardRow = (amount: number, description: string) => ({
  accountNumber: "1234",
  date: "2026-11-02",
  processedDate: "2026-11-02",
  originalAmount: amount,
  originalCurrency: "ILS",
  chargedAmount: amount,
  description,
  type: "normal" as const,
  status: "completed" as const,
});

describe("refunds reduce spending totals", () => {
  it("nets a card refund against the charge instead of adding to spend", () => {
    q.saveSyncTransactions(
      ws,
      [cardRow(-500, "Amazon"), cardRow(200, "זיכוי Amazon")],
      "isracard",
      cred,
      run,
      ["1234"]
    );

    expect(q.getPeriodTotal(ws, "2026-11-01", "2026-11-30")).toBe(300);
    expect(home.getCashFlow(ws, "2026-11-01", "2026-11-30").expenses).toBe(300);

    const summary = q.getTransactionsSummary(ws, "2026-11-01", "2026-11-30");
    expect(summary.expense.total).toBe(300);
    expect(summary.income.total).toBe(0);
    expect(summary.net).toBe(-300);
  });

  it("counts low-confidence AI categories on the 1-7 scale the prompt uses", () => {
    const setConfidence = (score: number) =>
      db
        .prepare(
          "UPDATE transactions SET ai_confidence = ?, category_source = 'ai' WHERE workspace_id = ? AND description = 'Amazon'"
        )
        .run(score, ws);

    setConfidence(3);
    expect(home.getNeedsAttentionCounts(ws).lowConfidence).toBe(1);
    setConfidence(6);
    expect(home.getNeedsAttentionCounts(ws).lowConfidence).toBe(0);
  });
});
