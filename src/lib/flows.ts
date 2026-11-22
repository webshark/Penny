/**
 * What a transaction does to the household's money, independent of who charged it.
 * `kind` answers "which tab is this row in"; `flowType` answers "should this count as spending,
 * income, or money moving between our own pockets". Reports read flowType so a transfer or a
 * refund can never inflate income or spending.
 */
export const FLOW_TYPES = [
  "expense",
  "income",
  "refund",
  "transfer_internal",
  "investment",
  "loan_drawdown",
  "loan_repayment",
  "fee",
] as const;

export type FlowType = (typeof FLOW_TYPES)[number];

/** Flows that belong in spending totals. A refund is negative spending, not income. */
export const SPEND_FLOWS: readonly FlowType[] = ["expense", "refund", "loan_repayment", "fee"];

export function isSpendFlow(flow: FlowType): boolean {
  return SPEND_FLOWS.includes(flow);
}

export interface FlowInput {
  kind: "expense" | "income" | "transfer";
  /** Signed ILS as charged: negative leaves the account. */
  chargedAmount: number;
}

/**
 * The base classification a stored row gets from its kind and sign.
 * Refunds arrive as positive rows on a card, so a positive expense is a refund, never income.
 */
export function classifyFlow(input: FlowInput): FlowType {
  if (input.kind === "transfer") return "transfer_internal";
  if (input.kind === "income") return "income";
  return input.chargedAmount > 0 ? "refund" : "expense";
}

/**
 * Signed cash effect on the household. Money moving between our own accounts and borrowed
 * principal are real movements but not income or spending, so they contribute zero here.
 */
export function cashAmount(flow: FlowType, amount: number): number {
  return flow === "transfer_internal" || flow === "loan_drawdown" ? 0 : amount;
}
