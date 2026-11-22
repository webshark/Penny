/** Pairing a payback credit (a Bit transfer, say) with the expense it repays (pure, unit-tested). */

export type PaybackKind = "expense" | "income" | "transfer";

export interface PaybackSide {
  id: number;
  /** Signed as charged: an expense is negative, a payback credit positive. */
  amount: number;
  kind: PaybackKind;
  isExcluded: boolean;
}

export type PaybackError =
  | "same-row"
  | "transfer"
  | "excluded"
  | "not-pair"
  | "already-linked"
  | "too-large"
  | "not-found";

export interface PaybackPair {
  creditId: number;
  expenseId: number;
  creditAbs: number;
  expenseAbs: number;
}

/**
 * Which of two rows is the payback credit and which the expense it repays.
 * Only a row that still counts as income can be the credit: a card refund is already stored as a
 * positive expense and already nets against its charge, so pairing it again would net it twice.
 */
export function paybackPair(
  a: PaybackSide,
  b: PaybackSide,
): { ok: true; pair: PaybackPair } | { ok: false; code: PaybackError } {
  if (a.id === b.id) return { ok: false, code: "same-row" };
  if (a.kind === "transfer" || b.kind === "transfer") return { ok: false, code: "transfer" };
  if (a.isExcluded || b.isExcluded) return { ok: false, code: "excluded" };

  const credit = [a, b].find((x) => x.kind === "income" && x.amount > 0);
  const expense = [a, b].find((x) => x.kind === "expense" && x.amount < 0);
  if (!credit || !expense) return { ok: false, code: "not-pair" };

  return {
    ok: true,
    pair: { creditId: credit.id, expenseId: expense.id, creditAbs: credit.amount, expenseAbs: -expense.amount },
  };
}

/**
 * A credit may cover only what no earlier credit covered, so a dinner split three ways works
 * and a credit larger than what is left does not. The cent of slack absorbs float noise.
 */
export function coversExpense(expenseAbs: number, coveredAbs: number, creditAbs: number): boolean {
  if (!(creditAbs > 0) || !(expenseAbs > 0)) return false;
  return coveredAbs + creditAbs <= expenseAbs + 0.005;
}
