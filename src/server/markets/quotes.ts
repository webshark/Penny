import "server-only";
import { markFailed, recentlyFailed } from "@/server/lib/fetch-backoff";

import { getDb } from "../db/index";
import type { Quote } from "@/lib/types";
import { isDemoMode } from "@/server/demo/mode";

const TTL_MS = 15 * 60 * 1000;
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

interface ChartMeta {
  regularMarketPrice?: number;
  currency?: string;
  shortName?: string;
  longName?: string;
  regularMarketTime?: number;
}

/** Parse a Yahoo chart response into a Quote. Exported for tests. */
export function parseChart(symbol: string, json: unknown, now = new Date()): Quote | null {
  const result = (json as { chart?: { result?: { meta: ChartMeta; timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] } })
    ?.chart?.result?.[0];
  const marketPrice = result?.meta?.regularMarketPrice;
  if (!result || !marketPrice) return null;
  const meta = result.meta;
  // Tel Aviv prices come in agorot, London in pence, Johannesburg in cents: report the main unit.
  const MINOR: Record<string, string> = { ILA: "ILS", GBp: "GBP", GBX: "GBP", ZAc: "ZAR" };
  const scale = meta.currency && MINOR[meta.currency] ? 0.01 : 1;
  const currency = meta.currency && MINOR[meta.currency] ? MINOR[meta.currency] : (meta.currency ?? "USD");
  const stamps = result.timestamp ?? [];
  const raw = result.indicators.quote[0]?.close ?? [];
  const points = stamps
    .map((t, i) => ({ t: t * 1000, c: raw[i] }))
    .filter((p): p is { t: number; c: number } => typeof p.c === "number");
  const price = marketPrice * scale;
  const closes = points.map((p) => p.c * scale);
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const firstThisYear = points.findIndex((p) => p.t >= yearStart);
  // The last close before 1 Jan is the YTD base.
  const ytdBase = firstThisYear > 0 ? closes[firstThisYear - 1] : closes[0] ?? null;
  const change = (base: number | null) => (base ? price / base - 1 : null);
  const step = Math.max(1, Math.floor(closes.length / 52));

  return {
    symbol,
    name: meta.longName ?? meta.shortName ?? symbol,
    price,
    currency,
    changeDay: change(prevClose),
    changeYtd: change(ytdBase),
    change12m: change(closes[0] ?? null),
    series: closes.filter((_, i) => i % step === 0 || i === closes.length - 1),
    asOf: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    stale: false,
  };
}

async function fetchQuote(symbol: string): Promise<Quote | null> {
  const res = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?range=1y&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return parseChart(symbol, await res.json());
}

/** Cached quotes; on a failed fetch the last known quote is returned with stale = true, or null if there is none. */
export async function getQuotes(symbols: string[]): Promise<Map<string, Quote | null>> {
  const db = getDb();
  const read = db.prepare("SELECT payload, fetched_at as fetchedAt FROM quotes_cache WHERE symbol = ?");
  const write = db.prepare(
    "INSERT INTO quotes_cache (symbol, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at"
  );
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  // The demo is offline: no quotes are fetched and every tile reads "unavailable".
  if (isDemoMode()) return new Map<string, Quote | null>();
  const entries = await Promise.all(
    unique.map(async (symbol): Promise<[string, Quote | null]> => {
      const cached = read.get(symbol) as { payload: string; fetchedAt: number } | undefined;
      if (cached && Date.now() - cached.fetchedAt < TTL_MS) return [symbol, JSON.parse(cached.payload)];
      const fresh = recentlyFailed(`quote:${symbol}`) ? null : await fetchQuote(symbol).catch(() => null);
      if (!fresh) markFailed(`quote:${symbol}`);
      if (fresh) {
        write.run(symbol, JSON.stringify(fresh), Date.now());
        return [symbol, fresh];
      }
      return [symbol, cached ? { ...JSON.parse(cached.payload), stale: true } : null];
    })
  );
  return new Map(entries);
}

/** ILS per one unit of `currency`, from the quotes above (1 for ILS, null if unknown). */
export function fxRate(currency: string, quotes: Map<string, Quote | null>): number | null {
  if (currency === "ILS") return 1;
  return quotes.get(`${currency}ILS=X`)?.price ?? null;
}
