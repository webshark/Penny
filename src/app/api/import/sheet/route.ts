import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { createManualTransaction } from "@/server/db/queries/manual-transactions";
import {
  categoryIdsByName,
  deleteSheetImport,
  insertSheetRows,
  recordSheetImport,
  type SheetInsertRow,
} from "@/server/db/queries/sheet-imports";
import { getAppSettings } from "@/server/db/queries/settings";
import { storedForImport } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { markDuplicates } from "@/lib/file-import";
import { isValidOwner, normalizeTag } from "@/lib/tags";
import { roundCents } from "@/lib/money";
import { MAX_SHEET_AMOUNT, MAX_SHEET_ROWS, SHEET_CASH_ACCOUNT, signedSheetAmount } from "@/lib/sheet-import";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** What the sheet's pickers need: accounts, leaf categories and household members. */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const db = getDb();
  const accounts = db
    .prepare(
      `SELECT account_number AS accountNumber, MAX(provider) AS provider, MAX(label) AS label FROM (
         SELECT t.account_number, t.provider, bc.label FROM transactions t
         LEFT JOIN bank_credentials bc ON bc.id = t.credential_id WHERE t.workspace_id = ?
         UNION ALL SELECT account_number, 'cash', 'מזומן' FROM transactions WHERE workspace_id = ? AND account_number = 'cash'
       ) GROUP BY account_number ORDER BY account_number`,
    )
    .all(workspaceId, workspaceId) as { accountNumber: string; provider: string; label: string | null }[];
  const categories = db
    .prepare(
      `SELECT id, name, kind, color FROM categories
       WHERE workspace_id = ? AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)
       ORDER BY kind, name`,
    )
    .all(workspaceId) as { id: number; name: string; kind: string; color: string | null }[];
  const members = getAppSettings(workspaceId).household.members.map((m) => ({ id: m.id, name: m.name }));
  const tags = db
    .prepare("SELECT DISTINCT tag FROM transaction_tags WHERE workspace_id = ? ORDER BY tag LIMIT 200")
    .all(workspaceId) as { tag: string }[];
  return NextResponse.json({ accounts, categories, members, tags: tags.map((t) => t.tag) });
}

type RowStatus = "added" | "duplicate" | "error";

interface IncomingRow {
  index: number;
  account: string;
  values: SheetInsertRow;
  categoryName: string;
}

/** Validates one row and resolves everything the write needs; returns a code the card translates. */
function readRow(
  raw: Record<string, unknown>,
  index: number,
  memberIds: string[],
): { row: IncomingRow; code: null } | { row: null; code: string } {
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { row: null, code: "dateInvalid" };
  if (date < "1990-01-01" || date > "2100-01-01") return { row: null, code: "dateInvalid" };

  const description = typeof raw.description === "string" ? raw.description.replace(/\s+/g, " ").trim() : "";
  if (!description) return { row: null, code: "descriptionRequired" };
  if (description.length > 120) return { row: null, code: "descriptionTooLong" };

  const amount = raw.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return { row: null, code: "amountRequired" };
  if (amount > MAX_SHEET_AMOUNT) return { row: null, code: "amountRange" };

  const kind = raw.kind === "income" ? "income" : raw.kind === "expense" ? "expense" : null;
  if (!kind) return { row: null, code: "kindRequired" };

  const account = typeof raw.account === "string" ? raw.account.trim().slice(0, 40) : "";
  if (!account) return { row: null, code: "accountRequired" };

  const categoryName = typeof raw.category === "string" ? raw.category.trim().slice(0, 40) : "";

  const business = raw.businessSharePct === undefined ? 0 : raw.businessSharePct;
  if (typeof business !== "number" || !Number.isInteger(business) || business < 0 || business > 100) return { row: null, code: "businessRange" };

  const owner = raw.owner == null || raw.owner === "" ? null : String(raw.owner);
  if (owner !== null && !isValidOwner(owner, memberIds)) return { row: null, code: "ownerInvalid" };

  const tags: string[] = [];
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.length > 20) return { row: null, code: "tagsInvalid" };
    for (const t of raw.tags) {
      const tag = normalizeTag(t);
      if (tag == null) return { row: null, code: "tagsInvalid" };
      tags.push(tag);
    }
  }

  const memo = typeof raw.memo === "string" && raw.memo.trim() ? raw.memo.trim().slice(0, 500) : null;
  if (typeof raw.memo === "string" && raw.memo.length > 500) return { row: null, code: "memoTooLong" };

  return {
    row: {
      index,
      account,
      categoryName,
      values: { date, description, amount: roundCents(amount), kind, categoryId: null, tags: [...new Set(tags)], owner, businessSharePct: business, memo },
    },
    code: null,
  };
}

/**
 * Saves the smart sheet: { rows: [...], dryRun?, source? }. Each row names its own account. The
 * cash account becomes a manual row (editable forever); a real bank/card account becomes a file
 * batch, so the next sync adopts it instead of doubling it. dryRun only checks duplicates.
 */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = ((await request.json().catch(() => null)) ?? {}) as { rows?: unknown; dryRun?: unknown };
  if (!Array.isArray(body.rows) || body.rows.length === 0) return bad("rows are required");
  if (body.rows.length > MAX_SHEET_ROWS) return bad(`at most ${MAX_SHEET_ROWS} rows`);

  const memberIds = getAppSettings(workspaceId).household.members.map((m) => m.id);
  const statuses: { index: number; status: RowStatus; code?: string }[] = [];
  const valid: IncomingRow[] = [];
  (body.rows as Record<string, unknown>[]).forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      statuses.push({ index, status: "error", code: "invalidRow" });
      return;
    }
    const read = readRow(raw, index, memberIds);
    if (!read.row) statuses.push({ index, status: "error", code: read.code });
    else valid.push(read.row);
  });

  // Category names resolve on the server so a renamed or deleted category fails the row, not the save.
  const categories = categoryIdsByName(workspaceId, valid.map((r) => r.categoryName).filter(Boolean));
  const ready: IncomingRow[] = [];
  for (const row of valid) {
    if (row.categoryName) {
      const cat = categories.get(row.categoryName);
      if (!cat) {
        statuses.push({ index: row.index, status: "error", code: "unknownCategory" });
        continue;
      }
      if (cat.kind !== row.values.kind) {
        statuses.push({ index: row.index, status: "error", code: "categoryKind" });
        continue;
      }
      row.values.categoryId = cat.id;
    }
    ready.push(row);
  }

  // Duplicates per account, over the pasted date range only.
  const byAccount = new Map<string, IncomingRow[]>();
  for (const row of ready) {
    const list = byAccount.get(row.account) ?? [];
    list.push(row);
    byAccount.set(row.account, list);
  }
  const fresh: IncomingRow[] = [];
  let duplicates = 0;
  for (const [account, rows] of byAccount) {
    const dates = rows.map((r) => r.values.date).sort();
    const stored = storedForImport(workspaceId, account, dates[0], dates[dates.length - 1]);
    const mine = rows.map((r) => ({
      date: r.values.date,
      description: r.values.description,
      amount: signedSheetAmount(r.values),
    }));
    const marked = markDuplicates(mine, stored);
    rows.forEach((row, i) => {
      if (marked[i].duplicate) {
        duplicates++;
        statuses.push({ index: row.index, status: "duplicate" });
      } else fresh.push(row);
    });
  }

  if (body.dryRun === true) {
    return NextResponse.json({
      dryRun: true,
      ready: fresh.length,
      duplicates,
      errors: statuses.filter((s) => s.status === "error").length,
      rows: statuses.sort((a, b) => a.index - b.index),
    });
  }

  const db = getDb();
  const transactionIds: number[] = [];
  const cashRows = fresh.filter((r) => r.account === SHEET_CASH_ACCOUNT);
  const accountRows = fresh.filter((r) => r.account !== SHEET_CASH_ACCOUNT);

  for (const row of cashRows) {
    const id = createManualTransaction(
      db,
      workspaceId,
      {
        kind: row.values.kind,
        amount: row.values.amount,
        date: row.values.date,
        description: row.values.description,
        categoryId: row.values.categoryId,
        account: SHEET_CASH_ACCOUNT,
        memo: row.values.memo,
        tags: row.values.tags,
        owner: row.values.owner,
        businessSharePct: row.values.businessSharePct,
      },
      memberIds,
    );
    transactionIds.push(id);
    statuses.push({ index: row.index, status: "added" });
  }

  let batchId: number | null = null;
  for (const [account, rows] of groupBy(accountRows, (r) => r.account)) {
    const inserted = insertSheetRows(workspaceId, account, rows.map((r) => r.values));
    batchId ??= inserted.batchId;
    transactionIds.push(...inserted.ids);
    // A hash collision inside one batch (two identical rows already in the sheet) inserts once.
    rows.forEach((row, i) => statuses.push({ index: row.index, status: inserted.flags[i] ? "added" : "duplicate" }));
  }

  const importId = transactionIds.length > 0 ? recordSheetImport(workspaceId, transactionIds, duplicates) : null;
  const categorized = fresh.filter((r) => r.values.categoryId != null).length;
  return NextResponse.json({
    dryRun: false,
    ready: fresh.length,
    added: transactionIds.length,
    duplicates,
    errors: statuses.filter((s) => s.status === "error").length,
    categorized,
    needsReview: fresh.filter((r) => r.values.categoryId == null).length,
    importId,
    batchId,
    rows: statuses.sort((a, b) => a.index - b.index),
  });
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k) ?? [];
    list.push(item);
    out.set(k, list);
  }
  return out;
}

/** Undo one sheet save: ?import=. Removes manual rows and file batches together. */
export async function DELETE(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const importId = Number(new URL(request.url).searchParams.get("import"));
  if (!Number.isInteger(importId) || importId <= 0) return bad("invalid import");
  return NextResponse.json({ removed: deleteSheetImport(workspaceId, importId) });
}
