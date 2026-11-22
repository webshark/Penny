/**
 * Envelope budgeting ("give every shekel a job"): the month's income minus what the category budgets
 * already claim. Positive is income no budget has taken yet; negative means the budgets promise more
 * than came in. Parent rows repeat their children's budgets, so only leaves count; with no category
 * budgets at all, the household's overall monthly target is what is claimed.
 */
export function envelopeBalance(income: number, categories: { isParent?: boolean; budget: number }[], monthlyTarget = 0) {
  const leaves = categories.reduce((s, c) => s + (!c.isParent && c.budget > 0 ? c.budget : 0), 0);
  const assigned = leaves > 0 ? leaves : Math.max(0, monthlyTarget);
  return { income, assigned, unassigned: income - assigned };
}
