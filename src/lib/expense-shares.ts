export interface ExpenseShare { id: number; transactionId: number; person: string; amount: number; settledAt: string | null; createdAt: string; description?: string; date?: string }

/** What each person still owes, biggest first; settled shares count for nothing. Names match ignoring case and spaces. */
export function shareBalances(shares: Pick<ExpenseShare, "person" | "amount" | "settledAt">[]) {
  const by = new Map<string, { person: string; owed: number; count: number }>();
  for (const s of shares) {
    if (s.settledAt) continue;
    const key = s.person.trim().toLowerCase();
    const row = by.get(key) ?? { person: s.person.trim(), owed: 0, count: 0 };
    row.owed += s.amount;
    row.count++;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.owed - a.owed);
}
