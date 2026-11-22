/** Spending by category and month, rolled up under each category's group. Pure: the API feeds it, the page draws it. */
export type PivotCell = { categoryId: number; name: string; color: string; amount: number };
export type PivotParent = { id: number; name: string; color: string };
export type PivotRow = { id: number; name: string; color: string; amounts: number[]; total: number; average: number; children: PivotRow[] };

/** The last n months as "YYYY-MM", oldest first, ending with today's month. */
export function lastMonths(n: number, today = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

const row = (id: number, name: string, color: string, amounts: number[], children: PivotRow[] = []): PivotRow => {
  const total = amounts.reduce((s, x) => s + x, 0);
  return { id, name, color, amounts, total, average: amounts.length ? total / amounts.length : 0, children };
};

/**
 * perMonth[i] is month i's spending per category. parentOf maps a category to its group (absent = it is its own row).
 * Rows are groups sorted by total, each holding its categories; a category with no group is a row of its own.
 */
export function buildPivot(months: string[], perMonth: PivotCell[][], parentOf: Map<number, PivotParent>): PivotRow[] {
  const leaves = new Map<number, { cell: PivotCell; amounts: number[] }>();
  perMonth.forEach((cells, i) => {
    for (const c of cells) {
      const leaf = leaves.get(c.categoryId) ?? { cell: c, amounts: months.map(() => 0) };
      leaf.amounts[i] += c.amount;
      leaves.set(c.categoryId, leaf);
    }
  });
  const groups = new Map<number, { parent: PivotParent; children: PivotRow[] }>();
  const loose: PivotRow[] = [];
  for (const { cell, amounts } of leaves.values()) {
    const leafRow = row(cell.categoryId, cell.name, cell.color, amounts);
    const parent = parentOf.get(cell.categoryId);
    if (!parent) { loose.push(leafRow); continue; }
    const g = groups.get(parent.id) ?? { parent, children: [] };
    g.children.push(leafRow);
    groups.set(parent.id, g);
  }
  const byTotal = (a: PivotRow, b: PivotRow) => b.total - a.total;
  const grouped = [...groups.values()].map(({ parent, children }) =>
    row(parent.id, parent.name, parent.color, months.map((_, i) => children.reduce((s, c) => s + c.amounts[i], 0)), children.sort(byTotal)));
  return [...grouped, ...loose].sort(byTotal);
}

/** Column totals across the top-level rows. */
export const pivotTotals = (rows: PivotRow[], n: number) => Array.from({ length: n }, (_, i) => rows.reduce((s, r) => s + r.amounts[i], 0));
