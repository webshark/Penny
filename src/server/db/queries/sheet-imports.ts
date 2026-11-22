import "server-only";

import { getDb } from "../index";
import { computeDedupHash } from "../../lib/dedup";
import { roundCents } from "@/lib/money";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import type { CategoryKind } from "@/lib/types";

/** Leaf categories by name, for the sheet's category column. Duplicates keep the first. */
export function categoryIdsByName(workspaceId: number, names: string[]): Map<string, { id: number; kind: CategoryKind }> {
  const out = new Map<string, { id: number; kind: CategoryKind }>();
  if (names.length === 0) return out;
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return out;
  const placeholders = unique.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT id, name, kind FROM categories
       WHERE workspace_id = ? AND name IN (${placeholders})
         AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)
       ORDER BY id`,
    )
    .all(workspaceId, ...unique) as { id: number; name: string; kind: CategoryKind }[];
  for (const r of rows) if (!out.has(r.name)) out.set(r.name, { id: r.id, kind: r.kind });
  return out;
}

export interface SheetInsertRow {
  date: string;
  description: string;
  amount: number;
  kind: "expense" | "income";
  categoryId: number | null;
  tags: string[];
  owner: string | null;
  businessSharePct: number;
  memo: string | null;
}

/**
 * Writes sheet rows for a real account as one file batch (provider 'file'), so the next bank sync
 * adopts them instead of doubling them and undo is a batch delete. The sheet's own kind, category,
 * owner, business share, memo and tags are written at insert; uncategorized rows wait for review.
 */
export function insertSheetRows(
  workspaceId: number,
  account: string,
  rows: SheetInsertRow[],
): { batchId: number; ids: number[]; added: number; flags: boolean[] } {
  const db = getDb();
  return db.transaction(() => {
    const batchId = Number(
      db
        .prepare(
          "INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date) VALUES (?, 'file', '1970-01-01', '1970-01-01', 'completed', '1970-01-01')",
        )
        .run(workspaceId).lastInsertRowid,
    );
    const insert = db.prepare(
      `INSERT INTO transactions (workspace_id, account_number, date, processed_date, original_amount, original_currency,
         charged_amount, charged_currency, description, memo, type, status, provider, credential_id, sync_run_id, dedup_hash, dedup_sequence,
         kind, category_id, category_source, needs_review, owner, business_share_pct)
       VALUES (@workspaceId, @account, @date, @date, @amount, 'ILS', @amount, 'ILS', @description, @memo, 'normal', 'completed', 'file',
         @credentialId, @batchId, @hash, @seq, @kind, @categoryId, @categorySource, @needsReview, @owner, @businessSharePct)
       ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO NOTHING`,
    );
    // A manual row on a real account would double-count against the bank: these are statement rows.
    const credential = (db
      .prepare(
        "SELECT credential_id AS c FROM transactions WHERE workspace_id = ? AND account_number = ? AND credential_id IS NOT NULL LIMIT 1",
      )
      .get(workspaceId, account) as { c: number } | undefined)?.c ?? null;
    const tagInsert = db.prepare("INSERT OR IGNORE INTO transaction_tags (workspace_id, transaction_id, tag) VALUES (?, ?, ?)");
    const hashCounts = new Map<string, number>();
    const ids: number[] = [];
    const flags: boolean[] = [];
    for (const r of rows) {
      const signed = roundCents(r.kind === "expense" ? -r.amount : r.amount);
      const hash = computeDedupHash({ accountNumber: account, date: r.date, originalAmount: signed, originalCurrency: "ILS", description: r.description });
      const seq = hashCounts.get(hash) ?? 0;
      hashCounts.set(hash, seq + 1);
      const res = insert.run({
        workspaceId,
        account,
        date: r.date,
        amount: signed,
        description: r.description,
        memo: r.memo,
        credentialId: credential,
        batchId,
        hash,
        seq,
        kind: r.kind,
        categoryId: r.categoryId,
        categorySource: r.categoryId == null ? null : "user",
        needsReview: r.categoryId == null ? 1 : 0,
        owner: r.owner,
        businessSharePct: r.businessSharePct,
      });
      flags.push(res.changes > 0);
      if (res.changes === 0) continue;
      const id = Number(res.lastInsertRowid);
      ids.push(id);
      for (const tag of r.tags) tagInsert.run(workspaceId, id, tag);
      if (r.categoryId != null) recordMerchantCategory(workspaceId, r.description, r.categoryId, r.kind, "user");
    }
    return { batchId, ids, added: ids.length, flags };
  })();
}

/** Records one sheet save so undo can remove exactly its rows later. */
export function recordSheetImport(workspaceId: number, transactionIds: number[], skipped: number): number {
  const db = getDb();
  return db.transaction(() => {
    const id = Number(
      db.prepare("INSERT INTO sheet_imports (workspace_id, added, skipped) VALUES (?, ?, ?)").run(workspaceId, transactionIds.length, skipped)
        .lastInsertRowid,
    );
    const link = db.prepare("INSERT OR IGNORE INTO sheet_import_rows (sheet_import_id, transaction_id) VALUES (?, ?)");
    for (const t of transactionIds) link.run(id, t);
    return id;
  })();
}

/** Undo one sheet save: its rows, the file batches it created, and the record. */
export function deleteSheetImport(workspaceId: number, importId: number): number {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare("SELECT id FROM sheet_imports WHERE workspace_id = ? AND id = ?").get(workspaceId, importId) as { id: number } | undefined;
    if (!row) return 0;
    const ids = (db.prepare("SELECT transaction_id FROM sheet_import_rows WHERE sheet_import_id = ?").all(importId) as { transaction_id: number }[]).map(
      (r) => r.transaction_id,
    );
    let removed = 0;
    if (ids.length > 0) {
      const runs = (db
        .prepare(
          `SELECT DISTINCT sync_run_id AS id FROM transactions
           WHERE workspace_id = ? AND provider = 'file' AND id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(workspaceId, ...ids) as { id: number }[]).map((r) => r.id);
      removed = db
        .prepare(`DELETE FROM transactions WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
        .run(workspaceId, ...ids).changes;
      for (const runId of runs) {
        const left = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE workspace_id = ? AND sync_run_id = ?").get(workspaceId, runId) as { n: number }).n;
        if (left === 0) db.prepare("DELETE FROM sync_runs WHERE workspace_id = ? AND id = ? AND provider = 'file'").run(workspaceId, runId);
      }
    }
    db.prepare("DELETE FROM sheet_imports WHERE workspace_id = ? AND id = ?").run(workspaceId, importId);
    return removed;
  })();
}
