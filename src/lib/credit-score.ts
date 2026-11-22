export interface CreditScore { id: number; date: string; bureau: string; score: number; note: string }

/** The newest score, its change from the one before, and whether a year has passed so a new free report is due. */
export function creditTrend(entries: CreditScore[], today: string) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const [latest, previous] = sorted;
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 10)}`;
  return {
    latest: latest ?? null,
    change: latest && previous ? latest.score - previous.score : null,
    reportDue: !latest || latest.date <= yearAgo,
    history: sorted,
  };
}
