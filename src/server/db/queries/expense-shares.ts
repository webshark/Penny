import "server-only";

import { getDb } from "../index";
import type { ExpenseShare } from "@/lib/expense-shares";

const COLUMNS = "s.id, s.transaction_id as transactionId, s.person, s.amount, s.settled_at as settledAt, s.created_at as createdAt";

export function listShares(workspaceId: number, transactionId?: number): ExpenseShare[] {
  const db = getDb();
  return transactionId != null
    ? (db.prepare(`SELECT ${COLUMNS} FROM expense_shares s WHERE s.workspace_id = ? AND s.transaction_id = ? ORDER BY s.id`).all(workspaceId, transactionId) as ExpenseShare[])
    : (db.prepare(`SELECT ${COLUMNS}, COALESCE(t.description, s.description) as description, COALESCE(t.date, s.date) as date
         FROM expense_shares s LEFT JOIN transactions t ON t.id = s.transaction_id AND t.workspace_id = s.workspace_id
         WHERE s.workspace_id = ? ORDER BY s.settled_at IS NOT NULL, COALESCE(t.date, s.date) DESC, s.id DESC`).all(workspaceId) as ExpenseShare[]);
}

/** "notFound" when the transaction is not an expense in this workspace; "tooMuch" when the shares would exceed it. */
export function addShare(workspaceId: number, transactionId: number, person: string, amount: number): ExpenseShare | "notFound" | "tooMuch" {
  const db = getDb();
  const tx = db.prepare("SELECT charged_amount as amount, description, date FROM transactions WHERE workspace_id = ? AND id = ? AND charged_amount < 0").get(workspaceId, transactionId) as
    | { amount: number; description: string; date: string } | undefined;
  if (!tx) return "notFound";
  const { open } = db.prepare("SELECT COALESCE(SUM(amount), 0) as open FROM expense_shares WHERE workspace_id = ? AND transaction_id = ?").get(workspaceId, transactionId) as { open: number };
  if (open + amount > -tx.amount + 0.005) return "tooMuch";
  const id = Number(db.prepare("INSERT INTO expense_shares (workspace_id, transaction_id, person, amount, description, date) VALUES (?, ?, ?, ?, ?, ?)")
    .run(workspaceId, transactionId, person, amount, tx.description, tx.date).lastInsertRowid);
  return db.prepare(`SELECT ${COLUMNS} FROM expense_shares s WHERE s.id = ?`).get(id) as ExpenseShare;
}

export function setShareSettled(workspaceId: number, id: number, settled: boolean): boolean {
  return getDb().prepare("UPDATE expense_shares SET settled_at = ? WHERE workspace_id = ? AND id = ?").run(settled ? new Date().toISOString() : null, workspaceId, id).changes > 0;
}

/** Settles every open share of one person (they paid it all back). */
export function settlePerson(workspaceId: number, person: string): number {
  return getDb()
    .prepare("UPDATE expense_shares SET settled_at = ? WHERE workspace_id = ? AND settled_at IS NULL AND lower(trim(person)) = lower(trim(?))")
    .run(new Date().toISOString(), workspaceId, person).changes;
}

export function deleteShare(workspaceId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM expense_shares WHERE workspace_id = ? AND id = ?").run(workspaceId, id).changes > 0;
}
