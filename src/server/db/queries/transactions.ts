import "server-only";
import { israelDay } from "@/server/lib/date-utils";

import { ownerClause } from "@/server/lib/owner-scope";
import { getDb } from "../index";
import { computeDedupHash } from "../../lib/dedup";
import { detectKind } from "../../lib/transfers";
import { BANK_PROVIDERS } from "@/lib/types";
import type {
  TransactionWithCategory,
  MonthlySummary,
  MerchantSummary,
  CategoryBreakdown,
} from "@/lib/types";
import {
  isTransactionSortField,
  TRANSACTION_SORT_SQL,
} from "@/lib/transaction-sort";
export type TransactionKindFilter = "expense" | "income" | "all";

interface RawTransaction {
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier?: string | number;
  installmentNumber?: number;
  installmentTotal?: number;
}

interface InsertResult {
  added: number;
  updated: number;
}

function dedupHashFor(txn: RawTransaction): string {
  return computeDedupHash({
    accountNumber: txn.accountNumber,
    date: txn.date,
    originalAmount: txn.originalAmount,
    originalCurrency: txn.originalCurrency,
    description: txn.description,
    identifier: txn.identifier,
    installmentNumber: txn.installmentNumber,
    installmentTotal: txn.installmentTotal,
  });
}

/** A card company is connected, so the bank's card bill is money that already arrives as charges. */
function hasCardCredential(workspaceId: number): boolean {
  const cardProviders = BANK_PROVIDERS.filter((b) => b.kind === "card").map((b) => b.id);
  if (cardProviders.length === 0) return false;
  return (
    getDb()
      .prepare(`SELECT 1 FROM bank_credentials WHERE workspace_id = ? AND provider IN (${cardProviders.map(() => "?").join(",")}) LIMIT 1`)
      .get(workspaceId, ...cardProviders) !== undefined
  );
}

export function insertTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  credentialId: number,
  syncRunId: number
): InsertResult {
  const db = getDb();
  let added = 0;
  let updated = 0;
  const cardExplainsBill = hasCardCredential(workspaceId);

  const hashCounts = new Map<string, number>();

  const existingCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE workspace_id = ? AND dedup_hash = ?"
  );

  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      workspace_id, account_number, date, processed_date, original_amount, original_currency,
      charged_amount, charged_currency, description, memo, type, status,
      identifier, installment_number, installment_total, provider, credential_id,
      sync_run_id, dedup_hash, dedup_sequence, kind
    ) VALUES (
      @workspaceId, @accountNumber, @date, @processedDate, @originalAmount, @originalCurrency,
      @chargedAmount, @chargedCurrency, @description, @memo, @type, @status,
      @identifier, @installmentNumber, @installmentTotal, @provider, @credentialId,
      @syncRunId, @dedupHash, @dedupSequence, @kind
    )
    ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO UPDATE SET
      status = CASE WHEN transactions.status = 'pending' THEN excluded.status ELSE transactions.status END,
      charged_amount = CASE WHEN transactions.status = 'pending' THEN excluded.charged_amount ELSE transactions.charged_amount END,
      processed_date = CASE WHEN transactions.status = 'pending' THEN excluded.processed_date ELSE transactions.processed_date END,
      kind = transactions.kind,
      updated_at = CASE WHEN transactions.status = 'pending' THEN datetime('now') ELSE transactions.updated_at END
  `);

  // A row an imported statement already stored (same account and amount, a day apart at most) becomes this
  // synced row in place, so its category, notes and tags stay and it is not counted twice. The bank's version wins.
  const fileTwinStmt = db.prepare(
    `SELECT id FROM transactions
     WHERE workspace_id = ? AND provider = 'file' AND account_number = ? AND charged_amount = ?
       AND abs(julianday(substr(date, 1, 10)) - julianday(substr(?, 1, 10))) <= 1
     ORDER BY abs(julianday(substr(date, 1, 10)) - julianday(substr(?, 1, 10))) LIMIT 1`
  );
  const adoptStmt = db.prepare(`
    UPDATE transactions SET
      date = @date, processed_date = @processedDate, original_amount = @originalAmount, original_currency = @originalCurrency,
      charged_amount = @chargedAmount, charged_currency = @chargedCurrency, description = @description, memo = @memo,
      type = @type, status = @status, identifier = @identifier, installment_number = @installmentNumber,
      installment_total = @installmentTotal, provider = @provider, credential_id = @credentialId,
      sync_run_id = @syncRunId, dedup_hash = @dedupHash, dedup_sequence = @dedupSequence, updated_at = datetime('now')
    WHERE id = @id`);

  const batchInsert = db.transaction(() => {
    for (const txn of transactions) {
      const hash = dedupHashFor(txn);

      const batchCount = (hashCounts.get(hash) ?? 0) + 1;
      hashCounts.set(hash, batchCount);

      const { count: existingCount } = existingCountStmt.get(workspaceId, hash) as {
        count: number;
      };

      const sequence = batchCount - 1;
      const kind = detectKind(txn.description, provider, txn.chargedAmount, { cardExplainsBill });

      const params = {
        workspaceId,
        accountNumber: txn.accountNumber,
        // Scrapers send UTC instants (Israeli midnight is 21:00/22:00Z the day before); stored as the Israeli day so
        // every date-range query and month grouping sees the right day. The dedup hash above still uses the raw value.
        date: israelDay(txn.date),
        processedDate: txn.processedDate ? israelDay(txn.processedDate) : txn.processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? null,
        description: txn.description,
        memo: txn.memo ?? null,
        type: txn.type,
        status: txn.status,
        identifier: txn.identifier != null ? String(txn.identifier) : null,
        installmentNumber: txn.installmentNumber ?? null,
        installmentTotal: txn.installmentTotal ?? null,
        provider,
        credentialId,
        syncRunId: syncRunId,
        dedupHash: hash,
        dedupSequence: sequence,
        kind,
      };

      if (batchCount > existingCount) {
        const twin = fileTwinStmt.get(workspaceId, txn.accountNumber, txn.chargedAmount, params.date, params.date) as { id: number } | undefined;
        if (twin) {
          adoptStmt.run({ ...params, id: twin.id });
          updated++;
        } else {
          insertStmt.run(params);
          added++;
        }
      } else {
        const result = insertStmt.run(params);
        if (result.changes > 0) {
          updated++;
        }
      }
    }
  });

  batchInsert();
  return { added, updated };
}

interface QueryParams {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  /**
   * Multi-id filter for parent-category aggregation. Takes precedence over
   * `category` when present and non-empty. Use it to fetch transactions
   * across all children of a parent category.
   */
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  /** @deprecated Use credentialIds */
  credentialId?: number;
  credentialIds?: number[];
  /** Household member filter: rows this member owns, directly or through the account's default owner. */
  owner?: { id: string; accounts: string[] };
  /** Trash: only the rows hidden from totals, to bring back. */
  hiddenOnly?: boolean;
  /** Only one bank account or card (its account number), for the account page. */
  accountNumber?: string;
  /** Review inbox: flagged by AI, or an expense/income with no category yet. */
  needsReview?: boolean;
  /** Only rows carrying this tag. */
  tag?: string;
}

function appendCredentialIdsFilter(
  conditions: string[],
  values: (string | number)[],
  credentialIds: number[] | undefined,
  columnPrefix = ""
): void {
  if (!credentialIds || credentialIds.length === 0) return;
  const col = `${columnPrefix}credential_id`;
  const placeholders = credentialIds.map(() => "?").join(",");
  conditions.push(`${col} IN (${placeholders})`);
  for (const id of credentialIds) values.push(id);
}

function resolveSortSql(sort: string | undefined): string {
  if (isTransactionSortField(sort)) {
    return TRANSACTION_SORT_SQL[sort];
  }
  return TRANSACTION_SORT_SQL.date;
}

const TRANSACTION_LIST_FROM = `
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN bank_credentials bc ON t.credential_id = bc.id`;

const TRANSACTION_LIST_SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color,
         (SELECT json_group_array(json_object('categoryId', a.category_id, 'amount', a.amount_cents / 100.0)) FROM transaction_allocations a WHERE a.transaction_id = t.id ORDER BY a.position) AS allocations_json,
         bc.label AS account_label,
         (SELECT group_concat(tag, char(31)) FROM transaction_tags tt WHERE tt.transaction_id = t.id) AS tags_concat
  ${TRANSACTION_LIST_FROM}`;

export function queryTransactions(
  workspaceId: number,
  params: QueryParams
): { transactions: TransactionWithCategory[]; total: number } {
  const db = getDb();
  const conditions: string[] = ["t.workspace_id = ?"];
  const values: (string | number)[] = [workspaceId];

  if (params.from) {
    conditions.push("t.date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("t.date <= ?");
    values.push(params.to);
  }
  if (params.search) {
    // A literal % or _ typed into the search box must not behave as a wildcard.
    const escaped = params.search.replace(/[\\%_]/g, (c) => `\\${c}`);
    conditions.push("(t.description LIKE ? ESCAPE '\\' OR t.memo LIKE ? ESCAPE '\\')");
    const term = `%${escaped}%`;
    values.push(term, term);
  }
  if (params.categoryIds && params.categoryIds.length > 0) {
    const placeholders = params.categoryIds.map(() => "?").join(",");
    conditions.push(`EXISTS (SELECT 1 FROM category_transactions ct WHERE ct.id=t.id AND COALESCE(ct.category_id,0) IN (${placeholders}))`);
    for (const cid of params.categoryIds) values.push(cid);
  } else if (params.category !== undefined) {
    conditions.push("EXISTS (SELECT 1 FROM category_transactions ct WHERE ct.id=t.id AND COALESCE(ct.category_id,0) = ?)");
    values.push(params.category);
  }
  const kind: TransactionKindFilter = params.kind ?? "all";
  // Group by kind, not by sign: a refund is a positive amount with kind='expense' and
  // would otherwise show up under the income filter.
  if (kind === "income") {
    conditions.push("t.kind = 'income'");
  } else if (kind === "expense") {
    conditions.push("t.kind = 'expense'");
  }
  if (params.provider) {
    conditions.push("t.provider = ?");
    values.push(params.provider);
  }
  const credentialIds =
    params.credentialIds && params.credentialIds.length > 0
      ? params.credentialIds
      : params.credentialId != null
        ? [params.credentialId]
        : undefined;
  appendCredentialIdsFilter(conditions, values, credentialIds, "t.");
  if (params.needsReview) {
    // Hidden rows are out of every total, so asking to categorize them is noise.
    conditions.push(
      "t.is_excluded = 0 AND (t.needs_review = 1 OR (t.category_id IS NULL AND t.kind != 'transfer'))"
    );
  }
  if (params.tag) {
    conditions.push("EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag = ?)");
    values.push(params.tag);
  }
  if (params.hiddenOnly) conditions.push("t.is_excluded = 1");
  if (params.accountNumber) {
    conditions.push("t.account_number = ?");
    values.push(params.accountNumber);
  }
  if (params.owner) {
    // The row's own owner wins; with none set, the account's default owner decides (same rule as effectiveOwner).
    const accounts = params.owner.accounts;
    conditions.push(`(t.owner = ? OR (t.owner IS NULL AND t.account_number IN (${accounts.map(() => "?").join(",") || "NULL"})))`);
    values.push(params.owner.id, ...accounts);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sortSql = resolveSortSql(params.sort);
  const sortOrder = params.order === "asc" ? "ASC" : "DESC";
  // "limit=abc" from a hand-edited URL used to reach SQLite as NaN and throw a 500.
  const rawLimit = params.limit;
  const limit =
    rawLimit != null && Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 50;
  const rawOffset = params.offset;
  const offset =
    rawOffset != null && Number.isFinite(rawOffset)
      ? Math.max(Math.trunc(rawOffset), 0)
      : 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number };

  const rows = db
    .prepare(
      `${TRANSACTION_LIST_SELECT}
       ${where}
       ORDER BY ${sortSql} ${sortOrder}, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return {
    transactions: rows.map(mapTransactionRow),
    total: countRow.total,
  };
}

/** Spend in the range that has no category yet, so the budget screen can show it instead of dropping it. */
export function getUncategorizedSpend(
  workspaceId: number,
  from: string,
  to: string
): { spent: number; count: number } {
  const o = ownerClause();
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(-charged_amount), 0) as spent, COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed'
         AND is_excluded = 0 AND kind = 'expense' AND category_id IS NULL${o.sql}`
    )
    .get(workspaceId, from, to, ...o.params) as { spent: number; count: number };
  return { spent: row.spent, count: row.count };
}

export function getUncategorizedTransactionIds(workspaceId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE workspace_id = ? AND category_id IS NULL AND kind != 'transfer' AND is_excluded = 0 ORDER BY date DESC"
    )
    .all(workspaceId) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getUncategorizedIdsByKind(
  workspaceId: number,
  kind: "expense" | "income"
): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE workspace_id = ? AND category_id IS NULL AND kind = ? AND is_excluded = 0 ORDER BY date DESC"
    )
    .all(workspaceId, kind) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getTransactionsForCategorization(
  workspaceId: number,
  ids: number[]
): { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null }[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount,
              original_currency as originalCurrency, memo
       FROM transactions WHERE workspace_id = ? AND id IN (${placeholders})`
    )
    .all(workspaceId, ...ids) as { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null }[];
}

export function updateTransactionCategory(
  workspaceId: number,
  id: number,
  categoryId: number,
  source: "ai" | "user"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = ?, category_source = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(categoryId, source, workspaceId, id);
}

export function batchUpdateCategories(
  workspaceId: number,
  updates: { id: number; categoryId: number; aiConfidence?: number | null }[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET category_id = ?, category_source = 'ai', ai_confidence = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ? AND category_source IS NOT 'user'`
  );

  db.transaction(() => {
    for (const { id, categoryId, aiConfidence } of updates) {
      stmt.run(categoryId, aiConfidence ?? null, workspaceId, id);
    }
  })();
}


export function getMonthlySummary(
  workspaceId: number,
  months: number
): MonthlySummary[] {
  const o = ownerClause();
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              SUM(-personal_amount) as amount
       FROM transactions
       WHERE workspace_id = ?
         AND date >= date('now', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0${o.sql}
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(workspaceId, months, ...o.params) as MonthlySummary[];
}

export function getTopMerchants(
  workspaceId: number,
  from: string,
  to: string,
  limit = 10
): MerchantSummary[] {
  const o = ownerClause();
  return getDb()
    .prepare(
      `SELECT description as name,
              SUM(-personal_amount) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
         AND is_excluded = 0${o.sql}
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(workspaceId, from, to, ...o.params, limit) as MerchantSummary[];
}

export function getCategoryBreakdown(
  workspaceId: number,
  from: string,
  to: string
): CategoryBreakdown[] {
  const o = ownerClause("t");
  return getDb()
    .prepare(
      `SELECT
         COALESCE(t.category_id, 0) as categoryId,
         COALESCE(c.name, 'Uncategorized') as name,
         COALESCE(c.color, '#B5B3AC') as color,
         SUM(-t.personal_amount) as amount,
         COUNT(DISTINCT t.id) as count
       FROM category_transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.date <= ? AND t.status = 'completed' AND t.kind = 'expense'
         AND t.is_excluded = 0${o.sql}
       GROUP BY t.category_id
       ORDER BY amount DESC`
    )
    .all(workspaceId, from, to, ...o.params) as CategoryBreakdown[];
}

export interface CategorySpend {
  categoryId: number;
  amount: number;
  count: number;
}

export function getCategorySpendInRange(
  workspaceId: number,
  from: string,
  to: string
): CategorySpend[] {
  const o = ownerClause();
  return getDb()
    .prepare(
      `SELECT category_id as categoryId,
              SUM(-personal_amount) as amount,
              COUNT(DISTINCT id) as count
       FROM category_transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
         AND is_excluded = 0${o.sql}
       GROUP BY category_id`
    )
    .all(workspaceId, from, to, ...o.params) as CategorySpend[];
}

export interface CategoryTopMerchant {
  categoryId: number;
  merchant: string;
  amount: number;
}

export function getTopMerchantPerCategory(
  workspaceId: number,
  from: string,
  to: string
): CategoryTopMerchant[] {
  const o = ownerClause();
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, description as merchant, amount
       FROM (
         SELECT category_id, description, SUM(-personal_amount) as amount,
                ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY SUM(-personal_amount) DESC) as rn
         FROM category_transactions
         WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
           AND is_excluded = 0${o.sql}
         GROUP BY category_id, description
       )
       WHERE rn = 1`
    )
    .all(workspaceId, from, to, ...o.params) as CategoryTopMerchant[];
}

export interface DailySpendPoint {
  date: string;
  amount: number;
}

export function getCategorySpendByDay(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string
): DailySpendPoint[] {
  return getDb()
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date(?)
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date(?)
       )
       SELECT days.d as date,
              COALESCE(SUM(-t.personal_amount), 0) as amount
       FROM days
       LEFT JOIN category_transactions t
         ON substr(t.date, 1, 10) = days.d
         AND t.workspace_id = ?
         AND t.category_id = ?
         AND t.kind = 'expense'
         AND t.status = 'completed'
         AND t.is_excluded = 0
       GROUP BY days.d
       ORDER BY days.d ASC`
    )
    .all(from, to, workspaceId, categoryId) as DailySpendPoint[];
}

export interface TopMerchantForCategory {
  merchant: string;
  amount: number;
  count: number;
}

export function getTopMerchantsForCategory(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string,
  limit = 8
): TopMerchantForCategory[] {
  return getDb()
    .prepare(
      `SELECT description as merchant,
              SUM(-personal_amount) as amount,
              COUNT(DISTINCT id) as count
       FROM category_transactions
       WHERE workspace_id = ? AND category_id = ?
         AND date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(workspaceId, categoryId, from, to, limit) as TopMerchantForCategory[];
}

export function getPeriodTotal(
  workspaceId: number,
  from: string,
  to: string
): number {
  const o = ownerClause();
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(-personal_amount), 0) as total
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
         AND is_excluded = 0${o.sql}`
    )
    .get(workspaceId, from, to, ...o.params) as { total: number };
  return row.total;
}

export function getPeriodCount(
  workspaceId: number,
  from: string,
  to: string
): number {
  const o = ownerClause();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
         AND is_excluded = 0${o.sql}`
    )
    .get(workspaceId, from, to, ...o.params) as { count: number };
  return row.count;
}

interface TransactionRow {
  allocations_json?: string;
  id: number;
  account_number: string;
  date: string;
  processed_date: string;
  original_amount: number;
  original_currency: string;
  charged_amount: number;
  charged_currency: string | null;
  description: string;
  memo: string | null;
  type: string;
  status: string;
  identifier: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category_id: number | null;
  category_source: string | null;
  ai_confidence: number | null;
  provider: string;
  credential_id: number | null;
  sync_run_id: number;
  kind: string;
  business_share_pct: number;
  needs_review: number;
  is_excluded: number;
  owner?: string | null;
  tags_concat?: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_color?: string | null;
  account_label?: string | null;
}

function mapTransactionRow(row: unknown): TransactionWithCategory {
  const r = row as TransactionRow;
  return {
    id: r.id,
    accountNumber: r.account_number,
    date: r.date,
    processedDate: r.processed_date,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency,
    chargedAmount: r.charged_amount,
    chargedCurrency: r.charged_currency,
    description: r.description,
    memo: r.memo,
    type: r.type as "normal" | "installments",
    status: r.status as "completed" | "pending",
    identifier: r.identifier,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    categoryId: r.category_id,
    categorySource: r.category_source as "ai" | "user" | null,
    aiConfidence: r.ai_confidence,
    provider: r.provider,
    credentialId: r.credential_id ?? null,
    accountLabel: r.account_label ?? null,
    syncRunId: r.sync_run_id,
    kind: r.kind as "expense" | "income" | "transfer",
    businessSharePct: r.business_share_pct ?? 0,
    needsReview: r.needs_review === 1,
    isExcluded: r.is_excluded === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    allocations: JSON.parse(String(r.allocations_json ?? "[]")),
    categoryName: r.category_name ?? null,
    categoryColor: r.category_color ?? null,
    owner: r.owner ?? null,
    tags: r.tags_concat ? r.tags_concat.split("\u001f") : [],
  };
}

export function setTransactionKind(
  workspaceId: number,
  id: number,
  kind: "expense" | "income" | "transfer"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET kind = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(kind, workspaceId, id);
}

export function setTransactionNeedsReview(
  workspaceId: number,
  id: number,
  value: boolean
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET needs_review = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(value ? 1 : 0, workspaceId, id);
}

interface TransactionContext {
  id: number;
  description: string;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  kind: "expense" | "income" | "transfer";
  provider: string;
}

export function getTransactionContext(
  workspaceId: number,
  id: number
): TransactionContext | null {
  const row = getDb()
    .prepare(
      `SELECT id, description, category_id as categoryId,
              category_source as categorySource, kind, provider
       FROM transactions WHERE workspace_id = ? AND id = ?`
    )
    .get(workspaceId, id) as TransactionContext | undefined;
  return row ?? null;
}

export function batchSetNeedsReview(
  workspaceId: number,
  updates: { id: number; needsReview: boolean }[]
): void {
  if (updates.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET needs_review = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  );
  db.transaction(() => {
    for (const { id, needsReview } of updates) {
      stmt.run(needsReview ? 1 : 0, workspaceId, id);
    }
  })();
}

export interface NeedsReviewCount {
  categoryId: number;
  count: number;
}

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export interface TransactionsSummaryParams {
  /** @deprecated Use credentialIds */
  credentialId?: number;
  credentialIds?: number[];
}

export function getTransactionsSummary(
  workspaceId: number,
  from: string,
  to: string,
  params: TransactionsSummaryParams = {}
): TransactionsSummary {
  const db = getDb();
  const baseConditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "is_excluded = 0",
  ];
  const baseValues: (string | number)[] = [workspaceId, from, to];
  const summaryCredentialIds =
    params.credentialIds && params.credentialIds.length > 0
      ? params.credentialIds
      : params.credentialId != null
        ? [params.credentialId]
        : undefined;
  appendCredentialIdsFilter(baseConditions, baseValues, summaryCredentialIds);
  const baseWhere = baseConditions.join(" AND ");

  // Group by kind, not by sign: a refund is a positive amount with kind='expense' and must reduce
  // spending instead of counting as income.
  const incomeAgg = db
    .prepare(
      `SELECT COALESCE(SUM(charged_amount), 0) as total, COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND kind = 'income'`
    )
    .get(...baseValues) as { total: number; count: number };

  const expenseAgg = db
    .prepare(
      `SELECT COALESCE(SUM(-charged_amount), 0) as total, COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND kind = 'expense'`
    )
    .get(...baseValues) as { total: number; count: number };

  const pickLargest = (sign: "income" | "expense"): TransactionWithCategory | null => {
    const kind = sign === "income" ? "income" : "expense";
    const tConditions = [
      "t.workspace_id = ?",
      "t.date >= ?",
      "t.date <= ?",
      "t.status = 'completed'",
      "t.is_excluded = 0",
      `t.kind = '${kind}'`,
    ];
    const tValues: (string | number)[] = [workspaceId, from, to];
    appendCredentialIdsFilter(tConditions, tValues, summaryCredentialIds, "t.");
    const row = db
      .prepare(
        `${TRANSACTION_LIST_SELECT}
         WHERE ${tConditions.join(" AND ")}
         ORDER BY ABS(t.charged_amount) DESC, t.id DESC
         LIMIT 1`
      )
      .get(...tValues);
    return row ? mapTransactionRow(row) : null;
  };

  const topMerchantsRows = db
    .prepare(
      `SELECT description,
              SUM(-charged_amount) as total,
              COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND kind = 'expense'
       GROUP BY description
       ORDER BY total DESC
       LIMIT 5`
    )
    .all(...baseValues) as { description: string; total: number; count: number }[];

  const pendingReview = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND needs_review = 1`
    )
    .get(...baseValues) as { count: number };

  return {
    income: {
      total: incomeAgg.total,
      count: incomeAgg.count,
      largest: pickLargest("income"),
    },
    expense: {
      total: expenseAgg.total,
      count: expenseAgg.count,
      largest: pickLargest("expense"),
    },
    net: incomeAgg.total - expenseAgg.total,
    topMerchants: topMerchantsRows,
    pendingReviewCount: pendingReview.count,
  };
}

export function getNeedsReviewCountByCategory(
  workspaceId: number,
  from: string,
  to: string
): NeedsReviewCount[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, COUNT(DISTINCT id) as count
       FROM category_transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
         AND needs_review = 1
         AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(workspaceId, from, to) as NeedsReviewCount[];
}

/**
 * Inserts a scrape and, in the same transaction, deletes pending rows of the scraped accounts that the
 * scrape no longer returns. Some scrapers emit a pending charge in a different shape (identifier, date,
 * sign) than its completed form, so the two never dedupe; rows still pending keep their hash and edits.
 */
export function saveSyncTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  credentialId: number,
  syncRunId: number,
  /** Every account the scrape returned, including ones with no rows (a voided charge leaves none). */
  scrapedAccounts: string[]
): InsertResult & { prunedPending: number } {
  const db = getDb();
  return db.transaction(() => {
    const result = insertTransactions(workspaceId, transactions, provider, credentialId, syncRunId);
    const accounts = [...new Set(scrapedAccounts)];
    if (accounts.length === 0) return { ...result, prunedPending: 0 };
    const keep = [...new Set(transactions.filter((t) => t.status === "pending").map(dedupHashFor))];
    const accountList = accounts.map(() => "?").join(",");
    const keepClause = keep.length ? `AND dedup_hash NOT IN (${keep.map(() => "?").join(",")})` : "";
    const prunedPending = db
      .prepare(
        `DELETE FROM transactions
         WHERE workspace_id = ? AND credential_id = ? AND status = 'pending'
           AND account_number IN (${accountList}) ${keepClause}`
      )
      .run(workspaceId, credentialId, ...accounts, ...keep).changes;
    return { ...result, prunedPending };
  })();
}

// ---- Tags, owners, cash wallet ---------------------------------------------

export function setTransactionTags(workspaceId: number, id: number, tags: string[]): boolean {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM transactions WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
  if (!exists) return false;
  const insert = db.prepare("INSERT OR IGNORE INTO transaction_tags (workspace_id, transaction_id, tag) VALUES (?, ?, ?)");
  db.transaction(() => {
    db.prepare("DELETE FROM transaction_tags WHERE workspace_id = ? AND transaction_id = ?").run(workspaceId, id);
    for (const tag of tags) insert.run(workspaceId, id, tag);
  })();
  return true;
}

export function setTransactionOwner(workspaceId: number, id: number, owner: string | null): boolean {
  return getDb()
    .prepare("UPDATE transactions SET owner = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?")
    .run(owner, workspaceId, id).changes > 0;
}

/** Every tagged, counted transaction (for tag totals and breakdowns). */
export function getTagRows(workspaceId: number): import("@/lib/tags").TagRow[] {
  return getDb()
    .prepare(
      `SELECT tt.tag, t.personal_amount AS amount, t.date, c.name AS category
       FROM transaction_tags tt
       JOIN transactions t ON t.id = tt.transaction_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE tt.workspace_id = ? AND t.is_excluded = 0 AND t.kind != 'transfer'`
    )
    .all(workspaceId) as import("@/lib/tags").TagRow[];
}

/** Renames a tag on every transaction; transactions that already carry the new name keep one copy. */
export function renameTag(workspaceId: number, from: string, to: string): number {
  const db = getDb();
  return db.transaction(() => {
    const moved = db.prepare("UPDATE OR IGNORE transaction_tags SET tag = ? WHERE workspace_id = ? AND tag = ?").run(to, workspaceId, from).changes;
    db.prepare("DELETE FROM transaction_tags WHERE workspace_id = ? AND tag = ?").run(workspaceId, from);
    return moved;
  })();
}

/** Removes a tag from every transaction (the transactions stay). */
export function deleteTag(workspaceId: number, tag: string): number {
  return getDb().prepare("DELETE FROM transaction_tags WHERE workspace_id = ? AND tag = ?").run(workspaceId, tag).changes;
}

/** Currencies in use: transactions by original currency plus assets, with how many of each. */
export function getCurrencyUsage(workspaceId: number): { currency: string; transactions: number; assets: number }[] {
  return getDb()
    .prepare(
      `SELECT currency, SUM(tx) AS transactions, SUM(asset) AS assets FROM (
         SELECT UPPER(original_currency) AS currency, 1 AS tx, 0 AS asset FROM transactions WHERE workspace_id = ? AND original_currency IS NOT NULL AND original_currency != ''
         UNION ALL
         SELECT UPPER(currency), 0, 1 FROM assets WHERE workspace_id = ? AND currency IS NOT NULL AND currency != ''
       ) GROUP BY currency ORDER BY transactions + assets DESC`
    )
    .all(workspaceId, workspaceId) as { currency: string; transactions: number; assets: number }[];
}

/** Every merchant (transaction description) with its count, spend and last date, most used first. */
export function getMerchantRows(workspaceId: number): { merchant: string; count: number; total: number; last: string }[] {
  return getDb()
    .prepare(
      `SELECT description AS merchant, COUNT(*) AS count, ROUND(SUM(personal_amount), 2) AS total, MAX(date) AS last
       FROM transactions
       WHERE workspace_id = ? AND is_excluded = 0 AND kind != 'transfer'
       GROUP BY description ORDER BY count DESC, merchant LIMIT 1000`
    )
    .all(workspaceId) as { merchant: string; count: number; total: number; last: string }[];
}

export function getOwnerRows(workspaceId: number, from: string, to: string): import("@/lib/tags").OwnerRow[] {
  return getDb()
    .prepare(
      `SELECT personal_amount AS amount, owner, account_number AS accountNumber
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND kind = 'expense' AND is_excluded = 0 AND charged_amount < 0`
    )
    .all(workspaceId, from, to) as import("@/lib/tags").OwnerRow[];
}

export function getAccountNumbers(workspaceId: number): { accountNumber: string; label: string | null; provider: string }[] {
  return getDb()
    .prepare(
      `SELECT t.account_number AS accountNumber, MAX(bc.label) AS label, MAX(t.provider) AS provider
       FROM transactions t LEFT JOIN bank_credentials bc ON bc.id = t.credential_id
       WHERE t.workspace_id = ? AND t.provider NOT IN ('cash', 'manual')
       GROUP BY t.account_number ORDER BY t.account_number`
    )
    .all(workspaceId) as { accountNumber: string; label: string | null; provider: string }[];
}

/** Candidate rows for the cash wallet; walletBalance() does the exact classification. */
export function getWalletRows(workspaceId: number, from: string): import("@/lib/tags").WalletRow[] {
  return getDb()
    .prepare(
      `SELECT t.charged_amount AS amount, t.description, c.name AS categoryName, t.provider
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.charged_amount < 0 AND t.is_excluded = 0
         AND (t.provider = 'cash' OR c.name = 'Cash & ATM' OR t.description LIKE '%כספומט%'
              OR t.description LIKE '%משיכת מזומן%' OR t.description LIKE '%ATM%')`
    )
    .all(workspaceId, from) as import("@/lib/tags").WalletRow[];
}

/** Logs cash spending as a manual expense (provider 'cash', account 'cash'). Returns the new id. */
export function insertCashExpense(workspaceId: number, amount: number, description: string, date: string, owner: string | null): number {
  const db = getDb();
  // transactions.sync_run_id is NOT NULL, so cash rows share one placeholder run per workspace,
  // dated 1970 so it never shows up as the "latest sync".
  let run = db.prepare("SELECT id FROM sync_runs WHERE workspace_id = ? AND provider = 'cash' LIMIT 1").get(workspaceId) as { id: number } | undefined;
  if (!run) {
    const r = db
      .prepare("INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date) VALUES (?, 'cash', '1970-01-01', '1970-01-01', 'completed', '1970-01-01')")
      .run(workspaceId);
    run = { id: Number(r.lastInsertRowid) };
  }
  const r = db
    .prepare(
      `INSERT INTO transactions (workspace_id, account_number, date, processed_date, original_amount, original_currency,
         charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash, kind, owner)
       VALUES (?, 'cash', ?, ?, ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed', 'cash', ?, ?, 'expense', ?)`
    )
    .run(workspaceId, date, date, -amount, -amount, description, run.id, `cash:${crypto.randomUUID()}`, owner);
  return Number(r.lastInsertRowid);
}

export function deleteCashExpense(workspaceId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM transactions WHERE workspace_id = ? AND id = ? AND provider = 'cash'").run(workspaceId, id).changes > 0;
}

// ---- Statement file import ---------------------------------------------------

/** Stored rows of one account from a day before `from` to a day after `to` (bank sync and earlier files alike). */
export function storedForImport(workspaceId: number, account: string, from: string, to: string): { date: string; amount: number }[] {
  return getDb()
    .prepare(
      `SELECT substr(date, 1, 10) AS date, charged_amount AS amount FROM transactions
       WHERE workspace_id = ? AND account_number = ? AND substr(date, 1, 10) BETWEEN date(?, '-1 day') AND date(?, '+1 day')`
    )
    .all(workspaceId, account, from, to) as { date: string; amount: number }[];
}

/**
 * Inserts one imported statement as its own placeholder sync run (provider 'file'), so the
 * run id is the batch id: rules apply to it like a sync, and undo deletes exactly this batch.
 */
export function insertFileImport(
  workspaceId: number,
  account: string,
  rows: { date: string; description: string; amount: number; seq: number }[],
  /** Card statements carry refunds as positive amounts, which must stay expenses (not income). */
  source: "bank" | "card" = "bank",
): { batchId: number; added: number } {
  const db = getDb();
  return db.transaction(() => {
    const runId = Number(
      db
        .prepare("INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date) VALUES (?, 'file', '1970-01-01', '1970-01-01', 'completed', '1970-01-01')")
        .run(workspaceId).lastInsertRowid
    );
    const stmt = db.prepare(
      `INSERT INTO transactions (workspace_id, account_number, date, processed_date, original_amount, original_currency,
         charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash, dedup_sequence, kind)
       VALUES (?, ?, ?, ?, ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed', 'file', ?, ?, ?, ?)
       ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO NOTHING`
    );
    const cardExplainsBill = hasCardCredential(workspaceId);
    let added = 0;
    for (const r of rows) {
      const hash = computeDedupHash({ accountNumber: account, date: r.date, originalAmount: r.amount, originalCurrency: "ILS", description: r.description });
      // A statement has no provider type; classify it like the matching source: bank transfer
      // patterns and sign, or a card row (always an expense, refunds included).
      const kind = detectKind(r.description, source === "card" ? "isracard" : "hapoalim", r.amount, { cardExplainsBill });
      added += stmt.run(workspaceId, account, r.date, r.date, r.amount, r.amount, r.description, runId, hash, r.seq, kind).changes;
    }
    return { batchId: runId, added };
  })();
}

/** How many rows of one import batch got a category from rules or merchant memory. */
export function countBatchCategories(workspaceId: number, batchId: number): { categorized: number; total: number } {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) AS categorized
       FROM transactions WHERE workspace_id = ? AND sync_run_id = ? AND provider = 'file'`
    )
    .get(workspaceId, batchId) as { total: number; categorized: number | null };
  return { total: row.total, categorized: row.categorized ?? 0 };
}

/** Flags uncategorized imported expenses for the review queue, the same way a sync does. */
export function flagBatchForReview(workspaceId: number, batchId: number): number {
  return getDb()
    .prepare(
      `UPDATE transactions SET needs_review = 1
       WHERE workspace_id = ? AND sync_run_id = ? AND provider = 'file'
         AND needs_review = 0 AND category_id IS NULL AND kind != 'transfer'`
    )
    .run(workspaceId, batchId).changes;
}

/** Undo for one import: removes only that batch's rows (provider 'file'). */
export function deleteFileImport(workspaceId: number, batchId: number): number {
  const db = getDb();
  return db.transaction(() => {
    const n = db.prepare("DELETE FROM transactions WHERE workspace_id = ? AND sync_run_id = ? AND provider = 'file'").run(workspaceId, batchId).changes;
    db.prepare("DELETE FROM sync_runs WHERE workspace_id = ? AND id = ? AND provider = 'file'").run(workspaceId, batchId);
    return n;
  })();
}

// ---- Settle-up and per-child -----------------------------------------------

/** Counted expenses after `from` (exclusive) for the split ledger. */
export function getSettleRows(workspaceId: number, from: string): import("@/lib/settle").SettleRow[] {
  return getDb()
    .prepare(
      `SELECT id, date, charged_amount AS amount, owner, account_number AS accountNumber, description
       FROM transactions
       WHERE workspace_id = ? AND date > ? AND kind = 'expense' AND is_excluded = 0 AND charged_amount != 0
       ORDER BY date DESC`
    )
    .all(workspaceId, from) as import("@/lib/settle").SettleRow[];
}

export function listSettleEntries(workspaceId: number): import("@/lib/settle").SettleEntry[] {
  return getDb()
    .prepare("SELECT id, counterpart, date, amount FROM settle_entries WHERE workspace_id = ? ORDER BY date DESC, id DESC")
    .all(workspaceId) as import("@/lib/settle").SettleEntry[];
}

export function addSettleEntry(workspaceId: number, counterpart: string, date: string, amount: number): number {
  return Number(getDb().prepare("INSERT INTO settle_entries (workspace_id, counterpart, date, amount) VALUES (?, ?, ?, ?)").run(workspaceId, counterpart, date, amount).lastInsertRowid);
}

export function deleteSettleEntry(workspaceId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM settle_entries WHERE workspace_id = ? AND id = ?").run(workspaceId, id).changes > 0;
}

/** Counted expenses (and refunds) in [from, to] with owner and category, for per-child views. */
export function getChildRows(workspaceId: number, from: string, to: string): {
  id: number; date: string; amount: number; owner: string | null; accountNumber: string; description: string; category: string | null;
}[] {
  return getDb()
    .prepare(
      `SELECT t.id, t.date, t.charged_amount AS amount, t.owner, t.account_number AS accountNumber, t.description, c.name AS category
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.date <= ? AND t.kind = 'expense' AND t.is_excluded = 0
       ORDER BY t.date DESC`
    )
    .all(workspaceId, from, to) as ReturnType<typeof getChildRows>;
}
