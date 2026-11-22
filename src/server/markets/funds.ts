import "server-only";
import { markFailed, recentlyFailed } from "@/server/lib/fetch-backoff";

import { getDb } from "../db/index";
import type { Fund, FundSource } from "@/lib/types";

/** data.gov.il datastore resources, "2024 to today" files. */
const RESOURCES: Record<FundSource, string> = {
  gemel: "a30dcbea-a1d2-482c-ae29-8f781f5025fb",
  pension: "6d47d6b5-cb08-488b-b333-f1e717b1e1bd",
};
const API = "https://data.gov.il/api/3/action/datastore_search";
const TTL_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, string | number | null>;

async function get(params: Record<string, string>): Promise<Row[]> {
  const res = await fetch(`${API}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`data.gov.il ${res.status}`);
  const json = (await res.json()) as { success: boolean; result: { records: Row[] } };
  if (!json.success) throw new Error("data.gov.il request failed");
  return json.result.records;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toFund(source: FundSource, r: Row): Fund {
  return {
    id: Number(r.FUND_ID),
    source,
    name: String(r.FUND_NAME ?? "").trim(),
    company: String(r.MANAGING_CORPORATION ?? ""),
    classification: String(r.FUND_CLASSIFICATION ?? ""),
    specialization: r.SPECIALIZATION ? String(r.SPECIALIZATION) : null,
    period: Number(r.REPORT_PERIOD),
    feeBalance: num(r.AVG_ANNUAL_MANAGEMENT_FEE),
    feeDeposit: num(r.AVG_DEPOSIT_FEE),
    ytd: num(r.YEAR_TO_DATE_YIELD),
    avg3y: num(r.AVG_ANNUAL_YIELD_TRAILING_3YRS),
    avg5y: num(r.AVG_ANNUAL_YIELD_TRAILING_5YRS),
    sharpe: num(r.SHARPE_RATIO),
    totalAssets: num(r.TOTAL_ASSETS),
  };
}

/** Every fund in the latest monthly report, cached a day; on failure the last cached copy is used. */
export async function loadFunds(source: FundSource): Promise<Fund[]> {
  const db = getDb();
  const cached = db.prepare("SELECT payload, fetched_at as fetchedAt FROM funds_cache WHERE source = ?").get(source) as
    | { payload: string; fetchedAt: number }
    | undefined;
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return JSON.parse(cached.payload);
  if (recentlyFailed(`funds:${source}`)) return cached ? JSON.parse(cached.payload) : [];
  try {
    const resource = RESOURCES[source];
    const [latest] = await get({ resource_id: resource, limit: "1", sort: "REPORT_PERIOD desc", fields: "REPORT_PERIOD" });
    const rows = await get({ resource_id: resource, limit: "3000", filters: JSON.stringify({ REPORT_PERIOD: latest.REPORT_PERIOD }) });
    const funds = rows.map((r) => toFund(source, r)).filter((f) => f.id && f.name);
    db.prepare(
      "INSERT INTO funds_cache (source, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(source) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at"
    ).run(source, JSON.stringify(funds), Date.now());
    return funds;
  } catch {
    markFailed(`funds:${source}`);
    return cached ? JSON.parse(cached.payload) : [];
  }
}
