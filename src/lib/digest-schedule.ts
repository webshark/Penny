/** Days the Telegram summary goes out (Sunday, Tuesday, Thursday), and the hour from which it may. */
export const DIGEST_DAYS = [0, 2, 4];
export const DIGEST_HOUR = 9;

/** Israel's date, weekday and hour for an instant. */
export function israelClock(now: Date): { date: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, hour: Number(parts.hour) };
}

/** True once per summary day, from DIGEST_HOUR on, unless today's summary was already sent. */
export function digestDue(now: Date, lastSent: string | null): boolean {
  const { date, weekday, hour } = israelClock(now);
  return DIGEST_DAYS.includes(weekday) && hour >= DIGEST_HOUR && lastSent !== date;
}
