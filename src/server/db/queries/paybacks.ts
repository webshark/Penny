import "server-only";

import { getDb } from "../index";
import { coversExpense, paybackPair, type PaybackError, type PaybackKind } from "@/lib/payback";

/** One side of a link, as the sheet shows it. `amount` keeps its sign. */
export interface PaybackTxn {
  id: number;
  date: string;
  description: string;
  amount: number;
}

export interface PaybackLinkView {
  credit: PaybackTxn;
  expense: PaybackTxn;
}

export interface PaybackState {
  links: PaybackLinkView[];
  /** Opposite rows near this date that could still be paired with this one. */
  candidates: PaybackTxn[];
  /** How much of this expense earlier credits already covered (0 for a credit row). */
  coveredAbs: number;
}

interface Row extends PaybackTxn {
  kind: PaybackKind;
  categoryId: number | null;
  businessSharePct: number;
  excluded: number;
}

type Self = Omit<Row, "excluded"> & { isExcluded: boolean };

const SELECT = `SELECT t.id, substr(t.date, 1, 10) AS date, t.description, t.charged_amount AS amount,
       t.kind, t.category_id AS categoryId, t.business_share_pct AS businessSharePct, t.is_excluded AS excluded
  FROM transactions t`;

const window = `AND t.date BETWEEN date(?, '-60 day') AND date(?, '+60 day')`;

function getRow(workspaceId: number, id: number): Self | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE t.workspace_id = ? AND t.id = ?`)
    .get(workspaceId, id) as Row | undefined;
  return row ? { ...row, isExcluded: row.excluded === 1 } : null;
}

const toTxn = (r: Self): PaybackTxn => ({ id: r.id, date: r.date, description: r.description, amount: r.amount });

/** What earlier credits already covered of this expense. */
function coveredFor(workspaceId: number, expenseId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(ABS(c.charged_amount)), 0) AS covered
       FROM transaction_links l JOIN transactions c ON c.id = l.credit_id
       WHERE l.workspace_id = ? AND l.expense_id = ?`,
    )
    .get(workspaceId, expenseId) as { covered: number };
  return row.covered;
}

/** Expenses that still have room for this credit, nearest amount first, then nearest date. */
const EXPENSES = `WITH used AS (
    SELECT l.expense_id AS expenseId, SUM(ABS(c.charged_amount)) AS covered
    FROM transaction_links l JOIN transactions c ON c.id = l.credit_id
    WHERE l.workspace_id = ?
    GROUP BY l.expense_id
  )
  SELECT t.id, substr(t.date, 1, 10) AS date, t.description, t.charged_amount AS amount
  FROM transactions t
  LEFT JOIN used u ON u.expenseId = t.id
  WHERE t.workspace_id = ? AND t.id != ? AND t.status = 'completed' AND t.is_excluded = 0
    AND t.kind = 'expense' AND t.charged_amount < 0 ${window}
    AND ABS(t.charged_amount) - COALESCE(u.covered, 0) >= ?
  ORDER BY ABS(ABS(t.charged_amount) - ?), ABS(julianday(t.date) - julianday(?)), t.id DESC
  LIMIT 8`;

/** Credits that fit inside what this expense has left. */
const CREDITS = `SELECT t.id, substr(t.date, 1, 10) AS date, t.description, t.charged_amount AS amount
  FROM transactions t
  WHERE t.workspace_id = ? AND t.id != ? AND t.status = 'completed' AND t.is_excluded = 0
    AND t.kind = 'income' AND t.charged_amount > 0 ${window}
    AND t.charged_amount <= ?
    AND NOT EXISTS (SELECT 1 FROM transaction_links l WHERE l.workspace_id = ? AND l.credit_id = t.id)
  ORDER BY ABS(t.charged_amount - ?), ABS(julianday(t.date) - julianday(?)), t.id DESC
  LIMIT 8`;

function candidatesFor(workspaceId: number, self: Self, coveredAbs: number): PaybackTxn[] {
  const db = getDb();
  if (self.kind === "income" && self.amount > 0) {
    return db
      .prepare(EXPENSES)
      .all(workspaceId, workspaceId, self.id, self.date, self.date, self.amount, self.amount, self.date) as PaybackTxn[];
  }
  if (self.kind === "expense" && self.amount < 0) {
    const remaining = -self.amount - coveredAbs;
    return db
      .prepare(CREDITS)
      .all(workspaceId, self.id, self.date, self.date, remaining, workspaceId, remaining, self.date) as PaybackTxn[];
  }
  return [];
}

export function getPaybackState(workspaceId: number, id: number): PaybackState | null {
  const self = getRow(workspaceId, id);
  if (!self) return null;

  const pairs = getDb()
    .prepare(
      `SELECT credit_id AS creditId, expense_id AS expenseId FROM transaction_links
       WHERE workspace_id = ? AND (credit_id = ? OR expense_id = ?) ORDER BY credit_id`,
    )
    .all(workspaceId, id, id) as { creditId: number; expenseId: number }[];

  const links: PaybackLinkView[] = [];
  for (const p of pairs) {
    const credit = getRow(workspaceId, p.creditId);
    const expense = getRow(workspaceId, p.expenseId);
    if (credit && expense) links.push({ credit: toTxn(credit), expense: toTxn(expense) });
  }

  const coveredAbs = coveredFor(workspaceId, id);
  return { links, candidates: candidatesFor(workspaceId, self, coveredAbs), coveredAbs };
}

/** Links a credit to an expense by id; either id may be the credit. */
export function linkPayback(
  workspaceId: number,
  id: number,
  targetId: number,
): { ok: true } | { ok: false; code: PaybackError } {
  const db = getDb();
  return db.transaction((): { ok: true } | { ok: false; code: PaybackError } => {
    const a = getRow(workspaceId, id);
    const b = getRow(workspaceId, targetId);
    if (!a || !b) return { ok: false, code: "not-found" };

    const pair = paybackPair(a, b);
    if (!pair.ok) return { ok: false, code: pair.code };
    const { creditId, expenseId, creditAbs, expenseAbs } = pair.pair;

    const taken = db
      .prepare("SELECT 1 FROM transaction_links WHERE workspace_id = ? AND credit_id = ?")
      .get(workspaceId, creditId);
    if (taken) return { ok: false, code: "already-linked" };
    if (!coversExpense(expenseAbs, coveredFor(workspaceId, expenseId), creditAbs)) {
      return { ok: false, code: "too-large" };
    }

    const credit = creditId === a.id ? a : b;
    const expense = expenseId === a.id ? a : b;
    db.prepare(
      `INSERT INTO transaction_links (workspace_id, credit_id, expense_id, prev_kind, prev_category_id, prev_business_share_pct)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(workspaceId, creditId, expenseId, credit.kind, credit.categoryId, credit.businessSharePct);
    // The credit becomes a positive expense in the expense's category, which is what nets it out, and
    // takes the same business share so the personal totals keep the same split.
    db.prepare(
      `UPDATE transactions SET kind = 'expense', category_id = ?, business_share_pct = ?, needs_review = 0,
         updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
    ).run(expense.categoryId, expense.businessSharePct, workspaceId, creditId);
    return { ok: true };
  })();
}

/** Removes the link whose credit is `creditId` and gives the credit its own kind, category and share back. */
export function unlinkPayback(workspaceId: number, creditId: number): boolean {
  const db = getDb();
  const link = db
    .prepare(
      `SELECT prev_kind AS kind, prev_category_id AS categoryId, prev_business_share_pct AS businessSharePct
       FROM transaction_links WHERE workspace_id = ? AND credit_id = ?`,
    )
    .get(workspaceId, creditId) as { kind: string; categoryId: number | null; businessSharePct: number } | undefined;
  if (!link) return false;

  db.transaction(() => {
    db.prepare(
      `UPDATE transactions SET kind = ?, category_id = ?, business_share_pct = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
    ).run(link.kind, link.categoryId, link.businessSharePct, workspaceId, creditId);
    db.prepare("DELETE FROM transaction_links WHERE workspace_id = ? AND credit_id = ?").run(workspaceId, creditId);
  })();
  return true;
}
