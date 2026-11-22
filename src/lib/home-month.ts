/**
 * The day the dashboard is "as of": today, or the last day of an earlier month asked for as "YYYY-MM"
 * (so that month reads as finished). Anything else, a malformed value or a future month, is today.
 */
export function homeMonthDate(month: string | null, today: Date): Date {
  const m = month && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return today;
  const end = new Date(Number(m[1]), Number(m[2]), 0, 12);
  return end < today ? end : today;
}
