/**
 * "net worth drivers": each month's change in net worth, split into what was saved
 * (income minus expenses) and everything else (market moves, revaluations, debt paid from outside the books).
 */
export interface DriverMonth { month: string; change: number; saved: number; market: number }

/** `history` is any number of dated net worth points; a month's value is its last point. */
export function netWorthDrivers(history: { date: string; netWorth: number }[], savedByMonth: Record<string, number>): DriverMonth[] {
  const last = new Map<string, number>();
  for (const p of [...history].sort((a, b) => a.date.localeCompare(b.date))) last.set(p.date.slice(0, 7), p.netWorth);
  const months = [...last.keys()].sort();
  return months.slice(1).map((month, i) => {
    const change = (last.get(month) as number) - (last.get(months[i]) as number);
    const saved = savedByMonth[month] ?? 0;
    return { month, change, saved, market: change - saved };
  });
}
