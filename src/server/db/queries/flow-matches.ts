import "server-only";

import { getDb } from "../index";
import { parseFlowSnapshots, type FlowMatchView, type MatchKind } from "@/lib/flow-matches";

interface MatchRow {
  id: number;
  kind: MatchKind;
  createdAt: string;
  transactionId: number;
  date: string;
  description: string;
  account: string;
  provider: string;
  amount: number;
  categoryName: string | null;
  otherDescription: string | null;
  otherDate: string | null;
  otherAmount: number | null;
}

/** The automatic links still in force, newest first. */
export function listFlowMatches(workspaceId: number, limit = 200): FlowMatchView[] {
  return getDb()
    .prepare(
      `SELECT m.id, m.kind, m.created_at AS createdAt,
              t.id AS transactionId, t.date, t.description, t.account_number AS account,
              t.provider, t.charged_amount AS amount, c.name AS categoryName,
              o.description AS otherDescription, o.date AS otherDate, o.charged_amount AS otherAmount
       FROM flow_matches m
       JOIN transactions t ON t.id = m.primary_txn_id
       LEFT JOIN transactions o ON o.id = m.other_txn_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE m.workspace_id = ? AND m.status = 'active'
       ORDER BY t.date DESC, m.id DESC
       LIMIT ?`
    )
    .all(workspaceId, limit) as MatchRow[];
}

/**
 * Puts every touched row back exactly as it was, marks the rows so the engine never re-pairs them,
 * and retires the match. False when the match is gone or belongs to another workspace.
 */
export function cancelFlowMatch(workspaceId: number, matchId: number): boolean {
  const db = getDb();
  const match = db
    .prepare(
      `SELECT id, before_json AS beforeJson FROM flow_matches
       WHERE id = ? AND workspace_id = ? AND status = 'active'`
    )
    .get(matchId, workspaceId) as { id: number; beforeJson: string } | undefined;
  if (!match) return false;
  const snapshots = parseFlowSnapshots(match.beforeJson);
  if (snapshots.length === 0) return false;

  const restore = db.prepare(
    `UPDATE transactions
     SET kind = ?, flow_type = ?, linked_txn_id = ?, transfer_pair_id = ?, category_id = ?,
         pairing_locked = 1, updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`
  );

  return db.transaction(() => {
    for (const s of snapshots) {
      restore.run(s.kind, s.flow_type, s.linked_txn_id, s.transfer_pair_id, s.category_id, s.id, workspaceId);
    }
    db.prepare(
      `UPDATE flow_matches SET status = 'cancelled', cancelled_at = datetime('now')
       WHERE id = ? AND workspace_id = ?`
    ).run(matchId, workspaceId);
    return true;
  })();
}
