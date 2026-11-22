import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { buildSuggestions, taxYearFacts, type Suggestion, type SuggestionTxn } from "@/lib/suggestions";
import { loadInsights } from "@/server/insights/data";
import { listPolicies, getPlan } from "@/server/db/queries/plan";
import { listAssets } from "@/server/db/queries/assets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelDay, israelToday } from "@/server/lib/date-utils";
import { listRules } from "@/server/db/queries/rules";
import { applyRules } from "@/server/rules/engine";
import { fxMarkup, type FxCharge } from "@/lib/fx-markup";
import { dailyRates } from "@/server/insights/fx-rates";
import { isBankProvider } from "@/server/lib/transfers";
import { getAssetsPayload } from "@/server/markets/portfolio";
import { liquidCash } from "@/lib/allocation";
import { getAppSettings } from "@/server/db/queries/settings";
import { detectStageChanges } from "@/lib/stage-detect";
import { dictionaryCategory } from "@/lib/merchant-dictionary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const db = getDb();
  const today = israelToday();
  const since = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const txns = db
    .prepare(
      `SELECT t.date, t.description, t.charged_amount as amount, t.kind, c.name as categoryName
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.status = 'completed' AND t.is_excluded = 0`
    )
    .all(ws, since) as SuggestionTxn[];
  const dismissed = new Set(
    (db.prepare("SELECT key FROM dismissed_suggestions WHERE workspace_id = ?").all(ws) as { key: string }[]).map((r) => r.key)
  );
  const known = [...listPolicies(ws).map((p) => p.name), ...listAssets(ws).map((a) => a.name)].map((n) => n.toLowerCase());
  const priceChanges = loadInsights(ws, today)
    .series.filter((s) => s.status === "suggested" && s.priceChange)
    .map((s) => ({ merchant: s.merchant, from: s.priceChange!.from, to: s.priceChange!.to }));
  // Corrections are unique per merchant and wrong category, so 2+ rows means the same fix made from different starting points.
  const merchantRules = listRules(ws).filter((r) => r.field === "merchant");
  const ruleCandidates = (
    db
      .prepare(
        `SELECT cc.merchant_key as merchant, MAX(cc.description) as description, cc.user_category_id as categoryId,
                c.name as categoryName, SUM(cc.times) as count
         FROM category_corrections cc JOIN categories c ON c.id = cc.user_category_id
         WHERE cc.workspace_id = ? GROUP BY cc.merchant_key, cc.user_category_id HAVING SUM(cc.times) >= 2`
      )
      .all(ws) as { merchant: string; description: string; categoryId: number; categoryName: string; count: number }[]
  )
    .filter((r) => !applyRules({ description: r.description, chargedAmount: 0, accountNumber: "" }, merchantRules))
    .map(({ merchant, categoryId, categoryName, count }) => ({ merchant, categoryId, categoryName, count }));

  // Installment rows are excluded: their shekel charge is a slice of the foreign amount. So are bank rows: a
  // foreign-currency account's shekel amount is Penny's own conversion at the market rate, not a card's charge.
  const fxCharges = db
    .prepare(
      `SELECT date, original_currency as currency, original_amount as original, charged_amount as charged, provider
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND status = 'completed' AND is_excluded = 0 AND kind = 'expense'
         AND original_currency IS NOT NULL AND original_currency != 'ILS' AND COALESCE(charged_currency, 'ILS') = 'ILS'
         AND COALESCE(installment_total, 1) <= 1`
    )
    .all(ws, since)
    .filter((r) => !isBankProvider((r as { provider: string }).provider))
    .map((r) => ({ ...(r as FxCharge), date: israelDay((r as FxCharge).date) }));
  const fx = fxCharges.length ? fxMarkup(fxCharges, await dailyRates([...new Set(fxCharges.map((c) => c.currency))], today)) : null;

  // Seven years of salary credits for the tax-refund hint (claims go back six).
  const taxSince = `${Number(today.slice(0, 4)) - 7}-01-01`;
  const salaryRows = db
    .prepare(
      `SELECT t.date, t.description FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.kind = 'income' AND t.charged_amount > 0 AND t.is_excluded = 0
         AND (c.name = 'Salary' OR t.description LIKE '%משכורת%' OR t.description LIKE '%שכר%')`
    )
    .all(ws, taxSince) as { date: string; description: string }[];
  const months = (db
    .prepare("SELECT DISTINCT substr(date, 1, 7) as m FROM transactions WHERE workspace_id = ? AND date >= ?")
    .all(ws, taxSince) as { m: string }[]).map((r) => r.m);
  const taxYears = taxYearFacts(salaryRows, months, today);

  // Donations per tax year, for the §46 credit: the Donations category, or a donation by name when uncategorized.
  const donationRows = db
    .prepare(
      `SELECT substr(t.date, 1, 4) as year, t.description, -t.charged_amount as amount, c.name as category
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.kind = 'expense' AND t.status = 'completed' AND t.is_excluded = 0`
    )
    .all(ws, taxSince) as { year: string; description: string; amount: number; category: string | null }[];
  const donationTotals = new Map<number, number>();
  for (const r of donationRows) {
    if (r.category === "Donations" || (!r.category && dictionaryCategory(r.description, "expense") === "Donations")) {
      donationTotals.set(Number(r.year), (donationTotals.get(Number(r.year)) ?? 0) + r.amount);
    }
  }
  const donations = [...donationTotals].map(([year, total]) => ({ year, total: Math.round(total) })).sort((a, b) => a.year - b.year);

  const { assets } = await getAssetsPayload(ws);
  const banks = assets.filter((a) => a.source === "bank");
  const liquid = assets.length ? liquidCash(assets) : undefined;
  const checking = banks.length ? banks.reduce((s, a) => s + (a.isLiability ? -1 : 1) * (a.valueIls ?? 0), 0) : undefined;

  const suggestions: Suggestion[] = buildSuggestions(txns, { today, known, monthStartDay: getPlan(ws).monthStartDay, priceChanges, ruleCandidates, fxMarkup: fx, taxYears, liquid, checking })
    .filter((s) => !dismissed.has(s.key));
  // getAppSettings falls back to an empty household on a missing or corrupt setting.
  const knownEvents = getAppSettings(ws).household.events.map((e) => e.type);
  const stageHints = detectStageChanges(txns, knownEvents, today).filter((h) => !dismissed.has(h.key));
  return NextResponse.json({ suggestions, dismissed: [...dismissed], stageHints, donations });
}

/** Body: { key } — hides a suggestion for good. */
export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.slice(0, 300) : "";
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  getDb().prepare("INSERT OR IGNORE INTO dismissed_suggestions (workspace_id, key) VALUES (?, ?)").run(ws, key);
  return NextResponse.json({ success: true });
}
