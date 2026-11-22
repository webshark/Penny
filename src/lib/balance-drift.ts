/**
 * Checks a synced bank balance against the transactions: the new balance minus the previous one should equal
 * the completed transactions posted in between. A gap means a missing or doubled transaction (or a bank-side
 * correction). Days are Israel calendar days (YYYY-MM-DD).
 *
 * Returns null when it can't be told honestly: no earlier balance, both on the same day, a transaction on the
 * earlier sync's day (it may or may not be in the old balance), pending charges (banks differ on counting them),
 * or a scrape window that starts after the earlier sync (transactions in between weren't fetched).
 */
export function balanceDrift(
  prev: { balance: number; day: string } | null,
  balance: number,
  txns: { day: string; amount: number; status: string }[],
  today: string,
  /** First day the scrape fetched. */
  windowStart: string
): number | null {
  if (!prev || prev.day >= today || windowStart > prev.day) return null;
  const after = txns.filter((t) => t.day > prev.day);
  if (txns.some((t) => t.day === prev.day) || after.some((t) => t.status !== "completed")) return null;
  const moved = after.reduce((s, t) => s + t.amount, 0);
  return Math.round((balance - prev.balance - moved) * 100) / 100;
}

/** Gaps under this are rounding or interest accrual, not worth a warning. */
export const DRIFT_TOLERANCE = 1;
