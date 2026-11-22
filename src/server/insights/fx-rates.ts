import "server-only";

import type { DailyRates } from "@/lib/fx-markup";
import { isDemoMode } from "@/server/demo/mode";

// shortcut: in-memory, per process, refreshed once a day; move to quotes_cache if restarts make it refetch too often.
const cache = new Map<string, { day: string; closes: DailyRates[string]; failedAt?: number }>();
const RETRY_AFTER_MS = 10 * 60_000;

async function fetchDaily(currency: string) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${currency}ILS=X?range=2y&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const stamps: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const offset: number = r?.meta?.gmtoffset ?? 0;
  // Bars are stamped at the market's local open, so shift by its offset before taking the calendar day.
  return stamps
    .map((ts, i) => ({ date: new Date((ts + offset) * 1000).toISOString().slice(0, 10), close: closes[i] ?? 0 }))
    .filter((c) => c.close > 0);
}

/** Daily market closes in shekels for each currency; a currency that fails to load is left out. */
export async function dailyRates(currencies: string[], today: string): Promise<DailyRates> {
  const out: DailyRates = {};
  // The demo is offline: rates are left empty rather than asking Yahoo.
  if (isDemoMode()) return out;
  await Promise.all(
    currencies
      .filter((c) => /^[A-Z]{3}$/.test(c) && c !== "ILS")
      .map(async (c) => {
        const hit = cache.get(c);
        if (hit?.day === today && !(hit.failedAt && Date.now() - hit.failedAt > RETRY_AFTER_MS)) return void (out[c] = hit.closes);
        // A failure is cached for a while too, so an offline host doesn't wait on Yahoo with every request.
        // Not for the day: bank syncs convert foreign rows with these, and leave an account out without them.
        const fresh = await fetchDaily(c).catch(() => null);
        const closes = fresh ?? hit?.closes ?? [];
        cache.set(c, fresh ? { day: today, closes } : { day: today, closes, failedAt: Date.now() });
        out[c] = closes;
      })
  );
  return out;
}
