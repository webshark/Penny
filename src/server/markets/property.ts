import "server-only";
import { markFailed, recentlyFailed } from "@/server/lib/fetch-backoff";

import { getDb } from "../db/index";
import type { IndexPoint } from "@/lib/property";
import { isDemoMode } from "@/server/demo/mode";

/** CBS price index "מחירי דירות" (dwelling prices, base 1993 = 100), monthly. Public API, see docs/property-data.md. */
const SERIES = 40010;
const TTL_MS = 24 * 60 * 60 * 1000;

/** The whole monthly series, cached a day; on failure the last cached copy is used. */
export async function loadDwellingIndex(): Promise<IndexPoint[]> {
  // The demo is offline: a home keeps its purchase price instead of asking CBS for the index.
  if (isDemoMode()) return [];
  const db = getDb();
  const cached = db.prepare("SELECT payload, fetched_at as fetchedAt FROM property_index_cache WHERE series = ?").get(SERIES) as
    | { payload: string; fetchedAt: number }
    | undefined;
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return JSON.parse(cached.payload);
  if (recentlyFailed("cbs-dwelling")) return cached ? JSON.parse(cached.payload) : [];
  try {
    const url = `https://api.cbs.gov.il/index/data/price?id=${SERIES}&format=json&download=false&startPeriod=01-1994&endPeriod=12-2100&PageSize=1000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) throw new Error(`CBS ${res.status}`);
    const json = (await res.json()) as { month: { date: { year: number; month: number; currBase: { value: number } }[] }[] };
    const points = (json.month?.[0]?.date ?? [])
      .filter((d) => d.currBase?.value > 0)
      .map((d) => ({ month: `${d.year}-${String(d.month).padStart(2, "0")}`, value: d.currBase.value }));
    if (points.length === 0) throw new Error("CBS: empty series");
    db.prepare(
      "INSERT INTO property_index_cache (series, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(series) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at"
    ).run(SERIES, JSON.stringify(points), Date.now());
    return points;
  } catch {
    markFailed("cbs-dwelling");
    return cached ? JSON.parse(cached.payload) : [];
  }
}
