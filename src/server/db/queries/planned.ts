import "server-only";

import { getDb } from "../index";
import { isBankProvider } from "../../lib/transfers";
import { addDays } from "@/lib/balance-forecast";
import {
  cardTiming,
  isOverdue,
  nextPayment,
  plannedCandidates,
  plannedPayments,
  plannedSpend,
  type CardTiming,
  type PlannedAccountKind,
  type PlannedCharge,
  type PlannedItem,
  type PlannedItemView,
  type PlannedPayment,
  type PlannedPayload,
  type PlannedStatus,
} from "@/lib/planned";

export interface PlannedInput {
  id?: number;
  description: string;
  amount: number;
  date: string;
  account: string | null;
  installments: number;
  matchPattern: string | null;
  categoryId: number | null;
  owner: string | null;
  notes: string | null;
  status?: PlannedStatus;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const jsonIds = (v: unknown): number[] => {
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};

function itemOf(row: Row): PlannedItem {
  return {
    id: Number(row.id),
    description: String(row.description),
    amount: Number(row.amount),
    date: String(row.date).slice(0, 10),
    account: str(row.account),
    accountKind: row.account_kind as PlannedAccountKind,
    installments: Number(row.installments) || 1,
    matchPattern: str(row.match_pattern),
    categoryId: row.category_id == null ? null : Number(row.category_id),
    owner: str(row.owner),
    notes: str(row.notes),
    status: row.status as PlannedStatus,
    matchedTxnId: row.matched_txn_id == null ? null : Number(row.matched_txn_id),
    rejectedTxnIds: jsonIds(row.rejected_txn_ids),
  };
}

export function listPlanned(workspaceId: number, statuses: PlannedStatus[] = ["planned"]): PlannedItem[] {
  const marks = statuses.map(() => "?").join(",");
  return (
    getDb()
      .prepare(`SELECT * FROM planned_items WHERE workspace_id = ? AND status IN (${marks}) ORDER BY date, id`)
      .all(workspaceId, ...statuses) as Row[]
  ).map(itemOf);
}

export function accountExists(workspaceId: number, account: string): boolean {
  return !!getDb().prepare(`SELECT 1 FROM transactions WHERE workspace_id = ? AND account_number = ? LIMIT 1`).get(workspaceId, account);
}

function accountKindOf(workspaceId: number, account: string | null): { kind: PlannedAccountKind; provider: string | null } {
  if (!account) return { kind: "manual", provider: null };
  const row = getDb()
    .prepare(`SELECT provider FROM transactions WHERE workspace_id = ? AND account_number = ? LIMIT 1`)
    .get(workspaceId, account) as { provider: string } | undefined;
  if (!row) return { kind: "manual", provider: null };
  return { kind: isBankProvider(row.provider) ? "bank" : "card", provider: row.provider };
}

/** Charges of the last ~400 days: enough for card timing, and for every planned item's window. */
export function loadCharges(workspaceId: number, today: string): PlannedCharge[] {
  return (
    getDb()
      .prepare(
        `SELECT t.id, t.description, substr(t.date, 1, 10) AS date, substr(t.processed_date, 1, 10) AS billingDate,
                t.account_number AS account, -t.charged_amount AS amount, t.installment_number AS installmentNumber
         FROM transactions t
         WHERE t.workspace_id = ? AND t.kind = 'expense' AND t.is_excluded = 0 AND t.status = 'completed'
           AND substr(t.date, 1, 10) >= ?
         ORDER BY t.date`
      )
      .all(workspaceId, addDays(today, -400)) as PlannedCharge[]
  ).filter((c) => c.amount > 0);
}

/** The card timing each planned card item needs, keyed by item id. */
function timingsFor(items: PlannedItem[], charges: PlannedCharge[], fallbackDay: number): Map<number, CardTiming | null> {
  const out = new Map<number, CardTiming | null>();
  for (const item of items) {
    out.set(item.id, item.accountKind === "card" && item.account ? cardTiming(charges, item.account, fallbackDay) : null);
  }
  return out;
}

export function plannedPayload(workspaceId: number, today: string, billingDay = 10): PlannedPayload {
  const db = getDb();
  const all = (db
    .prepare(`SELECT * FROM planned_items WHERE workspace_id = ? ORDER BY status = 'planned' DESC, date, id`)
    .all(workspaceId) as Row[]).map(itemOf);
  const charges = loadCharges(workspaceId, today);
  const timings = timingsFor(all, charges, billingDay);
  const claimed = new Set(all.map((i) => i.matchedTxnId).filter((id): id is number => id != null));

  const items: PlannedItemView[] = all.map((item) => {
    const payments = plannedPayments(item, timings.get(item.id) ?? null);
    const candidates =
      item.status === "planned" ? plannedCandidates(item, charges, claimed).sort((a, b) => a.daysOff - b.daysOff) : [];
    return { ...item, payments, nextPayment: nextPayment(payments, today), candidates, overdue: isOverdue(item, today) };
  });

  const active = items.filter((i) => i.status === "planned");
  const monthEnd = `${addDays(today, 30).slice(0, 7)}-31`;
  const upcoming = plannedSpend(active, timings, today, monthEnd, today).reduce((s, p) => s + p.amount, 0);

  const accountRows = db
    .prepare(
      `SELECT account_number AS account, provider FROM transactions WHERE workspace_id = ? GROUP BY account_number, provider ORDER BY provider, account_number`
    )
    .all(workspaceId) as { account: string; provider: string }[];

  return {
    items,
    accounts: accountRows.map((r) => ({ account: r.account, provider: r.provider, kind: isBankProvider(r.provider) ? "bank" : "card" })),
    totals: {
      planned: active.length,
      matched: items.filter((i) => i.status === "matched").length,
      overdue: active.filter((i) => i.overdue).length,
      upcoming: Math.round(upcoming),
    },
  };
}

export function upsertPlanned(workspaceId: number, input: PlannedInput): number | null {
  const db = getDb();
  const { kind } = accountKindOf(workspaceId, input.account);
  const values = {
    description: input.description,
    amount: input.amount,
    date: input.date,
    account: input.account,
    account_kind: kind,
    installments: input.installments,
    match_pattern: input.matchPattern,
    category_id: input.categoryId,
    owner: input.owner,
    notes: input.notes,
    status: input.status ?? "planned",
  };
  const columns = Object.keys(values) as (keyof typeof values)[];
  if (input.id) {
    const changes = db
      .prepare(
        `UPDATE planned_items SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now')
         WHERE workspace_id = ? AND id = ?`
      )
      .run(...columns.map((c) => values[c]), workspaceId, input.id).changes;
    return changes ? input.id : null;
  }
  const res = db
    .prepare(`INSERT INTO planned_items (workspace_id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`)
    .run(workspaceId, ...columns.map((c) => values[c]));
  return Number(res.lastInsertRowid);
}

export function deletePlanned(workspaceId: number, id: number): boolean {
  return getDb().prepare(`DELETE FROM planned_items WHERE workspace_id = ? AND id = ?`).run(workspaceId, id).changes > 0;
}

export function setPlannedStatus(workspaceId: number, id: number, status: PlannedStatus): boolean {
  return (
    getDb()
      .prepare(`UPDATE planned_items SET status = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`)
      .run(status, workspaceId, id).changes > 0
  );
}

/**
 * Links a planned item to the real row that charged it. The item stops counting, and the
 * category / owner / notes / tags chosen in advance move to the real row and its installments.
 */
export function linkPlanned(workspaceId: number, itemId: number, txnId: number): boolean {
  const db = getDb();
  const item = listPlanned(workspaceId, ["planned", "matched", "cancelled"]).find((i) => i.id === itemId);
  if (!item) return false;
  const tx = db
    .prepare(
      `SELECT id, account_number AS account, description, installment_total AS total, date
       FROM transactions WHERE workspace_id = ? AND id = ?`
    )
    .get(workspaceId, txnId) as { id: number; account: string; description: string; total: number | null; date: string } | undefined;
  if (!tx) return false;

  const rows = tx.total && tx.total > 1
    ? (db
        .prepare(
          `SELECT id FROM transactions WHERE workspace_id = ? AND account_number = ? AND description = ? AND installment_total = ? AND substr(date, 1, 10) >= ?`
        )
        .all(workspaceId, tx.account, tx.description, tx.total, addDays(item.date, -7)) as { id: number }[]).map((r) => r.id)
    : [tx.id];

  db.transaction(() => {
    db.prepare(`UPDATE planned_items SET status = 'matched', matched_txn_id = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`).run(txnId, workspaceId, itemId);
    for (const id of rows) {
      if (item.categoryId != null) db.prepare(`UPDATE transactions SET category_id = ? WHERE workspace_id = ? AND id = ?`).run(item.categoryId, workspaceId, id);
      if (item.owner != null) db.prepare(`UPDATE transactions SET owner = COALESCE(owner, ?) WHERE workspace_id = ? AND id = ?`).run(item.owner, workspaceId, id);
      if (item.notes) db.prepare(`UPDATE transactions SET notes = COALESCE(notes, ?) WHERE workspace_id = ? AND id = ?`).run(item.notes, workspaceId, id);
    }
  })();
  return true;
}

/** "Not this one": back to planned, and that row is never matched to it again. */
export function unlinkPlanned(workspaceId: number, itemId: number): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT matched_txn_id, rejected_txn_ids FROM planned_items WHERE workspace_id = ? AND id = ?`)
    .get(workspaceId, itemId) as { matched_txn_id: number | null; rejected_txn_ids: string | null } | undefined;
  if (!row) return false;
  const rejected = [...new Set([...jsonIds(row.rejected_txn_ids), ...(row.matched_txn_id ? [row.matched_txn_id] : [])])];
  db.prepare(`UPDATE planned_items SET status = 'planned', matched_txn_id = NULL, rejected_txn_ids = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`).run(
    JSON.stringify(rejected),
    workspaceId,
    itemId
  );
  return true;
}

export function rejectCandidate(workspaceId: number, itemId: number, txnId: number): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT rejected_txn_ids FROM planned_items WHERE workspace_id = ? AND id = ?`).get(workspaceId, itemId) as
    | { rejected_txn_ids: string | null }
    | undefined;
  if (!row) return false;
  const rejected = [...new Set([...jsonIds(row.rejected_txn_ids), txnId])];
  db.prepare(`UPDATE planned_items SET rejected_txn_ids = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`).run(
    JSON.stringify(rejected),
    workspaceId,
    itemId
  );
  return true;
}

/** Matches items whose window has exactly one candidate. Several candidates are left to the user. */
export function matchPlanned(workspaceId: number, today: string): { matched: number; ambiguous: number } {
  const items = listPlanned(workspaceId, ["planned"]);
  if (!items.length) return { matched: 0, ambiguous: 0 };
  const from = addDays(items.reduce((min, i) => (i.date < min ? i.date : min), items[0].date), -7);
  const to = addDays(items.reduce((max, i) => (i.date > max ? i.date : max), items[0].date), 30);
  const charges = loadCharges(workspaceId, today).filter((c) => c.date >= from && c.date <= to);
  const claimed = new Set(
    (getDb()
      .prepare(`SELECT matched_txn_id FROM planned_items WHERE workspace_id = ? AND matched_txn_id IS NOT NULL`)
      .all(workspaceId) as { matched_txn_id: number }[]).map((r) => r.matched_txn_id)
  );
  let matched = 0;
  let ambiguous = 0;
  for (const item of items) {
    const candidates = plannedCandidates(item, charges, claimed);
    if (candidates.length === 1) {
      if (linkPlanned(workspaceId, item.id, candidates[0].id)) {
        claimed.add(candidates[0].id);
        matched++;
      }
    } else if (candidates.length > 1) {
      ambiguous++;
    }
  }
  return { matched, ambiguous };
}

/** Planned spend between two dates, for the forecast and the budget. */
export function plannedSpendBetween(workspaceId: number, today: string, from: string, to: string, billingDay = 10) {
  const items = listPlanned(workspaceId, ["planned"]);
  const charges = loadCharges(workspaceId, today);
  const timings = timingsFor(items, charges, billingDay);
  return plannedSpend(items, timings, from, to, today);
}

/** Every future planned payment with the account kind, for the per-account balance forecast. */
export function plannedPaymentsForForecast(workspaceId: number, today: string, billingDay = 10): PlannedPayment[] {
  const items = listPlanned(workspaceId, ["planned"]);
  const charges = loadCharges(workspaceId, today);
  const timings = timingsFor(items, charges, billingDay);
  return items.flatMap((item) => plannedPayments(item, timings.get(item.id) ?? null));
}

