import "server-only";

import { getDb } from "../db";
import { addDays, daysBetween } from "../lib/date-utils";
import { isBankProvider } from "../lib/transfers";
import { normalizeMerchant } from "../rules/normalize";
import type { FlowSnapshot } from "@/lib/flow-matches";
import type { FlowType } from "@/lib/flows";

/**
 * Finds the rows that only make sense together: the two halves of a transfer between our own
 * accounts, a refund and the purchase it reverses, and a loan repayment and the loan it pays.
 * Linking them keeps a transfer out of income and spending and puts a refund back on the category
 * it came from. Every link is recorded with the state it replaced, so the user can undo it.
 */

const REFUND_WINDOW_DAYS = 60;
const TRANSFER_WINDOW_DAYS = 3;
// Transfers move the same amount twice. A few agorot of rounding is normal, a percent is not.
const amountTolerance = (amount: number) => Math.max(0.05, Math.abs(amount) * 0.005);
const LOAN_TEXT = /הלוואה|הלוואת|\bloan\b/i;

interface Row {
  id: number;
  account: string;
  provider: string;
  date: string;
  amount: number;
  kind: string;
  description: string;
  flowType: FlowType;
  categoryId: number | null;
  linkedTxnId: number | null;
  transferPairId: number | null;
}

export interface FlowReconcileResult {
  /** Pairs of rows linked as one transfer. */
  transfersPaired: number;
  refundsLinked: number;
  loansLinked: number;
}

/** Same merchant, or one description inside the other ("זיכוי זארה" vs "זארה"). */
function merchantScore(a: string, b: string): number {
  const left = normalizeMerchant(a);
  const right = normalizeMerchant(b);
  if (!left || !right) return 0;
  if (left === right) return 2;
  if (left.includes(right) || right.includes(left)) return 1;
  return 0;
}

function loadRows(workspaceId: number): Row[] {
  return getDb()
    .prepare(
      `SELECT id, account_number AS account, provider, date, charged_amount AS amount, kind,
              description, flow_type AS flowType, category_id AS categoryId,
              linked_txn_id AS linkedTxnId, transfer_pair_id AS transferPairId
       FROM transactions
       WHERE workspace_id = ? AND status = 'completed' AND charged_amount <> 0 AND pairing_locked = 0
       ORDER BY date, id`
    )
    .all(workspaceId) as Row[];
}

const snapshot = (row: Row): FlowSnapshot => ({
  id: row.id,
  kind: row.kind,
  flow_type: row.flowType,
  linked_txn_id: row.linkedTxnId,
  transfer_pair_id: row.transferPairId,
  category_id: row.categoryId,
});

/**
 * Runs the three passes in one transaction. Safe to call after every sync: only unlinked,
 * unlocked rows are considered, so it pairs what is new and leaves earlier decisions alone.
 */
export function reconcileFlows(workspaceId: number): FlowReconcileResult {
  const db = getDb();
  const rows = loadRows(workspaceId);

  const setFlow = db.prepare(
    `UPDATE transactions SET flow_type = ?, linked_txn_id = ?, updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`
  );
  const linkTransfer = db.prepare(
    `UPDATE transactions SET flow_type = 'transfer_internal', kind = 'transfer',
       transfer_pair_id = ?, updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`
  );
  const categoryOfSplit = db.prepare(
    `SELECT category_id AS id FROM transaction_allocations
     WHERE transaction_id = ? ORDER BY amount_cents DESC LIMIT 1`
  );
  const linkRefund = db.prepare(
    `UPDATE transactions SET linked_txn_id = ?, category_id = COALESCE(category_id, ?),
       updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`
  );
  const recordMatch = db.prepare(
    `INSERT INTO flow_matches (workspace_id, kind, primary_txn_id, other_txn_id, before_json)
     VALUES (?, ?, ?, ?, ?)`
  );

  return db.transaction((): FlowReconcileResult => {
    const result: FlowReconcileResult = { transfersPaired: 0, refundsLinked: 0, loansLinked: 0 };

    // 1. Loans first: a drawdown is not income, and a repayment is not a subscription.
    // detectKind already files a loan deposit as a transfer, so accept both transfer_internal and income here.
    const drawdowns = rows.filter(
      (r) =>
        r.amount > 0 &&
        isBankProvider(r.provider) &&
        LOAN_TEXT.test(r.description) &&
        r.flowType !== "refund" &&
        r.flowType !== "loan_drawdown"
    );
    for (const drawdown of drawdowns) {
      const before = snapshot(drawdown);
      db.prepare(
        `UPDATE transactions SET flow_type = 'loan_drawdown', kind = 'transfer', updated_at = datetime('now')
         WHERE id = ? AND workspace_id = ?`
      ).run(drawdown.id, workspaceId);
      drawdown.flowType = "loan_drawdown";
      drawdown.kind = "transfer";
      recordMatch.run(workspaceId, "loan_drawdown", drawdown.id, null, JSON.stringify([before]));
    }
    const repayments = rows.filter(
      (r) => r.amount < 0 && isBankProvider(r.provider) && LOAN_TEXT.test(r.description) && r.flowType === "expense"
    );
    for (const repayment of repayments) {
      const loan = [...drawdowns].reverse().find((d) => d.date <= repayment.date) ?? null;
      const before = snapshot(repayment);
      setFlow.run("loan_repayment", loan?.id ?? null, repayment.id, workspaceId);
      repayment.flowType = "loan_repayment";
      repayment.linkedTxnId = loan?.id ?? null;
      recordMatch.run(workspaceId, "loan_repayment", repayment.id, loan?.id ?? null, JSON.stringify([before]));
      if (loan) result.loansLinked++;
    }

    // 2. Transfers between our own bank accounts: opposite amounts, different accounts, close dates.
    const negatives = rows.filter((r) => r.amount < 0 && r.flowType === "expense" && isBankProvider(r.provider));
    const positives = rows.filter(
      (r) => r.amount > 0 && isBankProvider(r.provider) && (r.flowType === "income" || r.flowType === "transfer_internal")
    );
    const used = new Set<number>();
    for (const positive of positives) {
      const tolerance = amountTolerance(positive.amount);
      const candidate = negatives
        .filter(
          (n) =>
            !used.has(n.id) &&
            n.account !== positive.account &&
            Math.abs(Math.abs(n.amount) - positive.amount) <= tolerance &&
            Math.abs(daysBetween(n.date, positive.date)) <= TRANSFER_WINDOW_DAYS
        )
        .sort(
          (a, b) =>
            Math.abs(Math.abs(a.amount) - positive.amount) - Math.abs(Math.abs(b.amount) - positive.amount) ||
            Math.abs(daysBetween(a.date, positive.date)) - Math.abs(daysBetween(b.date, positive.date))
        )[0];
      if (!candidate) continue;
      const before = [snapshot(candidate), snapshot(positive)];
      used.add(candidate.id);
      linkTransfer.run(candidate.id, candidate.id, workspaceId);
      linkTransfer.run(candidate.id, positive.id, workspaceId);
      candidate.flowType = "transfer_internal";
      candidate.kind = "transfer";
      candidate.transferPairId = candidate.id;
      positive.flowType = "transfer_internal";
      positive.kind = "transfer";
      positive.transferPairId = candidate.id;
      recordMatch.run(workspaceId, "transfer", candidate.id, positive.id, JSON.stringify(before));
      result.transfersPaired++;
    }

    // 3. Refunds: same account, same amount, up to two months after the purchase.
    const alreadyLinked = new Set(
      (db
        .prepare(`SELECT linked_txn_id AS id FROM transactions WHERE workspace_id = ? AND linked_txn_id IS NOT NULL`)
        .all(workspaceId) as { id: number }[]).map((r) => r.id)
    );
    const purchases = rows.filter((r) => r.amount < 0 && r.flowType === "expense");
    // A refund that is already linked is done; re-recording it would collide with its own match.
    const refunds = rows.filter((r) => r.amount > 0 && r.flowType === "refund" && r.linkedTxnId === null);
    for (const refund of refunds) {
      const pool = purchases.filter(
        (p) =>
          !alreadyLinked.has(p.id) &&
          p.account === refund.account &&
          p.date <= refund.date &&
          refund.date <= addDays(p.date, REFUND_WINDOW_DAYS) &&
          Math.abs(Math.abs(p.amount) - refund.amount) <= amountTolerance(refund.amount)
      );
      if (pool.length === 0) continue;
      const best = pool
        .map((p) => ({ row: p, score: merchantScore(p.description, refund.description) }))
        .sort((a, b) => b.score - a.score || Math.abs(daysBetween(a.row.date, refund.date)) - Math.abs(daysBetween(b.row.date, refund.date)))[0];
      // A lone exact match on the same account is safe; otherwise require the merchant to match.
      if (best.score === 0 && pool.length > 1) continue;
      const splitCategory = (categoryOfSplit.get(best.row.id) as { id: number | null } | undefined)?.id ?? null;
      const before = snapshot(refund);
      linkRefund.run(best.row.id, splitCategory ?? best.row.categoryId, refund.id, workspaceId);
      alreadyLinked.add(best.row.id);
      refund.linkedTxnId = best.row.id;
      refund.categoryId = refund.categoryId ?? splitCategory ?? best.row.categoryId;
      recordMatch.run(workspaceId, "refund", refund.id, best.row.id, JSON.stringify([before]));
      result.refundsLinked++;
    }

    return result;
  })();
}

/** Exported for the tests and for callers that already hold a row. */
export { merchantScore, amountTolerance };
