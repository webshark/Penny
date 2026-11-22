import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let ws: number;
let db: import("better-sqlite3").Database;
let facts: typeof import("@/server/finance/facts");
let reconcileFlows: typeof import("@/server/finance/pairing").reconcileFlows;
let result: import("@/server/finance/pairing").FlowReconcileResult;

const txn = (accountNumber: string, description: string, chargedAmount: number, date: string) => ({
  accountNumber,
  originalCurrency: "ILS",
  status: "completed" as const,
  originalAmount: chargedAmount,
  chargedAmount,
  description,
  date,
  processedDate: date,
  type: "normal" as const,
});

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-flows-"));
  db = (await import("@/server/db/index")).getDb();
  facts = await import("@/server/finance/facts");
  ({ reconcileFlows } = await import("@/server/finance/pairing"));
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");

  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const cred = (provider: string) =>
    db
      .prepare(
        "INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, ?, ?, x'00', x'00', x'00')"
      )
      .run(ws, provider, provider).lastInsertRowid as number;

  const hapoalim = cred("hapoalim");
  const leumi = cred("leumi");
  const isracard = cred("isracard");

  const runH = createSyncRun(ws, "hapoalim", hapoalim, "2026-10-01");
  insertTransactions(
    ws,
    [
      txn("B1", "משכורת", 15000, "2026-11-01"),
      txn("B1", "העברה ללאומי", -1000, "2026-11-05"),
      txn("B1", "החזר הלוואה", -900, "2026-11-01"),
      txn("B1", "הלוואה", 20000, "2026-10-01"),
    ],
    "hapoalim",
    hapoalim,
    runH
  );

  const runL = createSyncRun(ws, "leumi", leumi, "2026-10-01");
  insertTransactions(ws, [txn("L1", "העברה מהפועלים", 1000, "2026-11-06")], "leumi", leumi, runL);

  const runC = createSyncRun(ws, "isracard", isracard, "2026-10-01");
  insertTransactions(
    ws,
    [txn("C1", "זארה", -500, "2026-10-20"), txn("C1", "זיכוי זארה", 500, "2026-10-25")],
    "isracard",
    isracard,
    runC
  );

  // A purchase usually gets its category from the rules or the user; the refund should follow it.
  const category = db
    .prepare("SELECT id FROM categories WHERE workspace_id = ? AND kind = 'expense' LIMIT 1")
    .get(ws) as { id: number };
  const purchase = db
    .prepare("SELECT id FROM transactions WHERE workspace_id = ? AND description = 'זארה'")
    .get(ws) as { id: number };
  db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(category.id, purchase.id);

  result = reconcileFlows(ws);
});

const row = (description: string) =>
  db
    .prepare("SELECT * FROM transactions WHERE workspace_id = ? AND description = ?")
    .get(ws, description) as {
    id: number;
    kind: string;
    flow_type: string;
    linked_txn_id: number | null;
    transfer_pair_id: number | null;
  };

describe("reconcileFlows", () => {
  it("pairs the two halves of a transfer and takes both out of income and spending", () => {
    const out = row("העברה ללאומי");
    const incoming = row("העברה מהפועלים");
    expect(result.transfersPaired).toBe(1);
    expect(out.flow_type).toBe("transfer_internal");
    expect(incoming.flow_type).toBe("transfer_internal");
    expect(out.kind).toBe("transfer");
    expect(incoming.kind).toBe("transfer");
    expect(incoming.transfer_pair_id).toBe(out.id);
    expect(out.transfer_pair_id).toBe(out.id);
    expect(facts.incomeBetween(ws, "2026-11-01", "2026-11-30")).toBe(15000);
    expect(facts.spendBetween(ws, "2026-11-01", "2026-11-30")).toBe(900);
  });

  it("links a refund to its purchase so the month nets to zero instead of counting income", () => {
    const purchase = row("זארה");
    const refund = row("זיכוי זארה");
    expect(result.refundsLinked).toBe(1);
    expect(refund.linked_txn_id).toBe(purchase.id);
    expect(facts.spendBetween(ws, "2026-10-01", "2026-10-31")).toBe(0);
    expect(facts.incomeBetween(ws, "2026-10-01", "2026-10-31")).toBe(0);
  });

  it("keeps borrowed money out of income and links the repayment to the loan", () => {
    const drawdown = row("הלוואה");
    const repayment = row("החזר הלוואה");
    expect(drawdown.flow_type).toBe("loan_drawdown");
    expect(repayment.flow_type).toBe("loan_repayment");
    expect(repayment.linked_txn_id).toBe(drawdown.id);
    expect(facts.cashBetween(ws, "2026-10-01", "2026-11-30").income).toBe(15000);
  });
});

describe("one source of truth", () => {
  it("Home, Overview and the facts layer agree on the same month", async () => {
    const { getCashFlow } = await import("@/server/db/queries/home");
    const { getPeriodTotals } = await import("@/server/db/queries/overview");
    const home = getCashFlow(ws, "2026-11-01", "2026-11-30");
    const overview = getPeriodTotals(ws, {
      kind: "month",
      startMonth: 11,
      year: 2026,
      from: "2026-11-01",
      to: "2026-11-30",
      months: ["2026-11"],
    });
    const factsTotals = facts.cashBetween(ws, "2026-11-01", "2026-11-30");
    expect(home).toEqual({ income: factsTotals.income, expenses: factsTotals.spend, net: factsTotals.net });
    expect(overview.income).toBe(factsTotals.income);
    expect(overview.expenses).toBe(factsTotals.spend);
    expect(overview.net).toBe(factsTotals.net);
  });
});

describe("flow totals", () => {
  it("assigns every row a flow type and the parts add up to the whole", () => {
    const rows = db.prepare("SELECT flow_type FROM transactions WHERE workspace_id = ?").all(ws) as {
      flow_type: string;
    }[];
    expect(rows.every((r) => ["expense", "income", "refund", "transfer_internal", "loan_drawdown", "loan_repayment"].includes(r.flow_type))).toBe(true);
    const sum = facts.flowTotals(ws).reduce((s, f) => s + f.total, 0);
    expect(sum).toBeCloseTo(facts.transactionsTotal(ws), 2);
  });

  it("is idempotent: a second pass links nothing new", () => {
    expect(reconcileFlows(ws)).toEqual({ transfersPaired: 0, refundsLinked: 0, loansLinked: 0 });
  });
});
