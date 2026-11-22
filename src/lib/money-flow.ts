/**
 * Nodes and links for a money-flow (Sankey) chart:
 * income → expenses and savings, expenses → the biggest categories and "other".
 * A deficit (spending above income) enters beside income, so the flows always balance.
 */
export interface FlowNode { name: string; color: string; kind: "income" | "deficit" | "expenses" | "saved" | "category" | "other" }
export interface FlowLink { source: number; target: number; value: number }

export function moneyFlow(income: number, categories: { name: string; spent: number; color: string }[], top = 7) {
  const cats = categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const expenses = cats.reduce((s, c) => s + c.spent, 0);
  if (expenses <= 0 && income <= 0) return null;
  const nodes: FlowNode[] = [{ name: "income", color: "var(--status-on-track)", kind: "income" }, { name: "expenses", color: "var(--expense)", kind: "expenses" }];
  const links: FlowLink[] = [];
  const spentFromIncome = Math.min(income, expenses);
  if (spentFromIncome > 0) links.push({ source: 0, target: 1, value: spentFromIncome });
  if (income > expenses) { nodes.push({ name: "saved", color: "var(--primary)", kind: "saved" }); links.push({ source: 0, target: nodes.length - 1, value: income - expenses }); }
  if (expenses > income) { nodes.push({ name: "deficit", color: "var(--status-heads-up)", kind: "deficit" }); links.push({ source: nodes.length - 1, target: 1, value: expenses - income }); }
  for (const c of cats.slice(0, top)) { nodes.push({ name: c.name, color: c.color, kind: "category" }); links.push({ source: 1, target: nodes.length - 1, value: c.spent }); }
  const rest = cats.slice(top).reduce((s, c) => s + c.spent, 0);
  if (rest > 0) { nodes.push({ name: "other", color: "var(--muted-foreground)", kind: "other" }); links.push({ source: 1, target: nodes.length - 1, value: rest }); }
  return { nodes, links, expenses };
}
