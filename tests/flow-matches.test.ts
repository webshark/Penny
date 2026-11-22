import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let ws: number;
let db: import("better-sqlite3").Database;
let listFlowMatches: typeof import("@/server/db/queries/flow-matches").listFlowMatches;
let cancelFlowMatch: typeof import("@/server/db/queries/flow-matches").cancelFlowMatch;
let reconcileFlows: typeof import("@/server/finance/pairing").reconcileFlows;
let facts: typeof import("@/server/finance/facts");

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

const row = (description: string) =>
  db.prepare("SELECT * FROM transactions WHERE workspace_id = ? AND description = ?").get(ws, description) as {
    id: number;
    kind: string;
    flow_type: string;
    linked_txn_id: number | null;
    transfer_pair_id: number | null;
    pairing_locked: number;
  };

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-matches-"));
  db = (await import("@/server/db/index")).getDb();
  ({ listFlowMatches, cancelFlowMatch } = await import("@/server/db/queries/flow-matches"));
  ({ reconcileFlows } = await import("@/server/finance/pairing"));
  facts = await import("@/server/finance/facts");
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
  insertTransactions(
    ws,
    [txn("B1", "העברה ללאומי", -1000, "2026-11-05")],
    "hapoalim",
    hapoalim,
    createSyncRun(ws, "hapoalim", hapoalim, "2026-11-01")
  );
  insertTransactions(
    ws,
    [txn("L1", "העברה מהפועלים", 1000, "2026-11-06")],
    "leumi",
    leumi,
    createSyncRun(ws, "leumi", leumi, "2026-11-01")
  );
  reconcileFlows(ws);
});

describe("parseFlowSnapshots", () => {
  it("keeps valid rows and drops anything malformed", async () => {
    const { parseFlowSnapshots } = await import("@/lib/flow-matches");
    const valid = {
      id: 4,
      kind: "expense",
      flow_type: "expense",
      linked_txn_id: null,
      transfer_pair_id: null,
      category_id: 2,
    };
    expect(parseFlowSnapshots(JSON.stringify([valid]))).toEqual([valid]);
    expect(parseFlowSnapshots("not json")).toEqual([]);
    expect(parseFlowSnapshots(JSON.stringify({ id: 1 }))).toEqual([]);
    expect(parseFlowSnapshots(JSON.stringify([{ ...valid, flow_type: "mystery" }]))).toEqual([]);
    expect(parseFlowSnapshots(JSON.stringify([{ ...valid, id: "4" }]))).toEqual([]);
    expect(parseFlowSnapshots(JSON.stringify([{ ...valid, category_id: 2.5 }]))).toEqual([]);
    expect(parseFlowSnapshots(JSON.stringify([valid, null, 7]))).toHaveLength(1);
  });
});

describe("automatic matches", () => {
  it("shows the transfer the engine paired", () => {
    const matches = listFlowMatches(ws);
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe("transfer");
    expect(matches[0].otherDescription).toBe("העברה מהפועלים");
    expect(facts.spendBetween(ws, "2026-11-01", "2026-11-30")).toBe(0);
  });

  it("undoes the match, locks both rows and lets the expense show again", () => {
    const [match] = listFlowMatches(ws);
    expect(cancelFlowMatch(ws, match.id)).toBe(true);

    const out = row("העברה ללאומי");
    const incoming = row("העברה מהפועלים");
    expect(out.flow_type).toBe("expense");
    expect(out.kind).toBe("expense");
    expect(out.transfer_pair_id).toBeNull();
    expect(incoming.flow_type).toBe("income");
    expect(incoming.transfer_pair_id).toBeNull();
    expect(out.pairing_locked).toBe(1);
    expect(incoming.pairing_locked).toBe(1);

    // The expense the transfer had hidden is back, and the engine will not hide it again.
    expect(facts.spendBetween(ws, "2026-11-01", "2026-11-30")).toBe(1000);
    expect(facts.incomeBetween(ws, "2026-11-01", "2026-11-30")).toBe(1000);
    expect(reconcileFlows(ws).transfersPaired).toBe(0);
    expect(listFlowMatches(ws)).toHaveLength(0);
  });

  it("cannot cancel the same match twice or one from another workspace", () => {
    const { id } = db.prepare("SELECT id FROM flow_matches LIMIT 1").get() as { id: number };
    expect(cancelFlowMatch(ws, id)).toBe(false);
    expect(cancelFlowMatch(ws + 1, id)).toBe(false);
    expect(cancelFlowMatch(ws, 999_999)).toBe(false);
  });
});
