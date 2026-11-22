// "Move from X": one-month budget moves between categories, stored as a JSON workspace setting.
import type { CategoryWithData } from "@/lib/types";

export interface BudgetMove { from: number; to: number; amount: number }
/** month (YYYY-MM) -> moves made for that month only. */
export type BudgetMoves = Record<string, BudgetMove[]>;

export function parseMoves(raw: unknown): BudgetMoves {
  const out: BudgetMoves = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [month, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !Array.isArray(list)) continue;
    const moves = list.filter(isMove);
    if (moves.length) out[month] = moves;
  }
  return out;
}

export function isMove(m: unknown): m is BudgetMove {
  const v = m as BudgetMove;
  return !!v && Number.isInteger(v.from) && Number.isInteger(v.to) && v.from !== v.to && Number.isFinite(v.amount) && v.amount > 0;
}

/** Categories that can give budget to `toId` this month, most room first. Rollup parents are skipped (their room belongs to the children). */
export function roomToMove(rows: CategoryWithData[], toId: number) {
  return rows
    .filter((r) => r.categoryId !== toId && r.budgetMode === "budgeted" && r.budget > 0 && r.remaining > 0 && !(r.isParent && r.budgetSource === "rollup"))
    .map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName, room: r.remaining }))
    .sort((a, b) => b.room - a.room);
}

const isOver = (r: CategoryWithData) => r.budgetMode === "budgeted" && r.budget > 0 && r.spent > r.budget;

/** Which category takes the move for a card: itself when over, or for a rollup parent its most-over child. Null when none is over. */
export function moveTarget(r: CategoryWithData, rows: CategoryWithData[]): CategoryWithData | null {
  if (!(r.isParent && r.budgetSource === "rollup")) return isOver(r) ? r : null;
  const kids = rows.filter((c) => c.parentId === r.categoryId && isOver(c)).sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  return kids[0] ?? null;
}
