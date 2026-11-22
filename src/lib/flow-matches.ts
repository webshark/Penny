import { FLOW_TYPES, type FlowType } from "./flows";

/** What the pairing engine linked, and therefore what the user can undo. */
export const MATCH_KINDS = ["transfer", "refund", "loan_drawdown", "loan_repayment"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

/** One automatic match, as the review card shows it. */
export interface FlowMatchView {
  id: number;
  kind: MatchKind;
  createdAt: string;
  transactionId: number;
  date: string;
  description: string;
  account: string;
  provider: string;
  /** Signed ILS as charged. */
  amount: number;
  categoryName: string | null;
  otherDescription: string | null;
  otherDate: string | null;
  otherAmount: number | null;
}

/** The stored previous state of one row, used to undo a match exactly. */
export interface FlowSnapshot {
  id: number;
  kind: string;
  flow_type: FlowType;
  linked_txn_id: number | null;
  transfer_pair_id: number | null;
  category_id: number | null;
}

const isFlowType = (value: unknown): value is FlowType =>
  typeof value === "string" && (FLOW_TYPES as readonly string[]).includes(value);
const nullableNumber = (value: unknown): value is number | null => value === null || Number.isInteger(value);

/** Stored JSON is untrusted, including rows written by an older version of the engine. */
export function parseFlowSnapshots(raw: string): FlowSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: FlowSnapshot[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!Number.isInteger(row.id) || typeof row.kind !== "string" || !isFlowType(row.flow_type)) continue;
    if (!nullableNumber(row.linked_txn_id) || !nullableNumber(row.transfer_pair_id) || !nullableNumber(row.category_id)) continue;
    out.push({
      id: row.id as number,
      kind: row.kind,
      flow_type: row.flow_type,
      linked_txn_id: row.linked_txn_id as number | null,
      transfer_pair_id: row.transfer_pair_id as number | null,
      category_id: row.category_id as number | null,
    });
  }
  return out;
}
