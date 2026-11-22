import "server-only";

import { assetSnapshots, listAccountBalances, listAssets, netWorthHistory, saveDailyNetWorth, saveSnapshots } from "../db/queries/assets";
import { BANK_PROVIDERS } from "@/lib/types";
import { fxRate, getQuotes } from "./quotes";
import { BENCHMARKS } from "@/lib/markets";
import { israelToday } from "../lib/date-utils";
import { studyFundIsLiquid } from "@/lib/study-fund";
import { splitGain } from "@/lib/holding-gain";
import type { Asset, AssetsPayload, AssetType, Fund, FundSource } from "@/lib/types";
import { loadFunds } from "./funds";
import { compareFund } from "@/lib/funds";
import { indexRevaluation } from "@/lib/property";
import { loadDwellingIndex } from "./property";
import { lastChange } from "@/lib/holdings";

/** Israeli capital gains tax on realised profit. */
const CAPITAL_GAINS_TAX = 0.25;
/** Tax-sheltered or taxed differently: no deferred capital gains tax. */
const UNTAXED: AssetType[] = ["pension", "study_fund", "provident", "real_estate", "vehicle", "cash", "deposit"];

export async function getAssetsPayload(workspaceId: number): Promise<AssetsPayload> {
  const rows = listAssets(workspaceId);
  const currencies = [...new Set(rows.map((r) => r.currency).filter((c) => c !== "ILS"))];
  const quotes = await getQuotes([
    ...rows.flatMap((r) => (r.symbol ? [r.symbol] : [])),
    ...currencies.map((c) => `${c}ILS=X`),
    ...BENCHMARKS,
  ]);
  // A holding priced in a currency no asset row names (AAPL added as ILS, quoted in USD) needs that rate too,
  // or its shekel value is null and it drops out of net worth.
  const missing = [...new Set([...quotes.values()].flatMap((q) => (q && q.currency !== "ILS" && !quotes.has(`${q.currency}ILS=X`) ? [q.currency] : [])))];
  if (missing.length) for (const [k, v] of await getQuotes(missing.map((c) => `${c}ILS=X`))) quotes.set(k, v);

  // Public fund data, only fetched when some asset is linked to a fund.
  const fundLists = new Map<FundSource, Fund[]>();
  for (const s of new Set(rows.flatMap((r) => (r.fundId && r.fundSource ? [r.fundSource] : [])))) fundLists.set(s, await loadFunds(s));
  const fundOf = (r: (typeof rows)[number]) => {
    const list = r.fundSource ? fundLists.get(r.fundSource) : undefined;
    const fund = list?.find((f) => f.id === r.fundId);
    return fund && list ? compareFund(fund, list) : null;
  };

  // Public CBS dwelling price index, only fetched when a home has a purchase price and month.
  const homeIndex = rows.some((r) => r.type === "real_estate" && r.purchasePrice && r.purchaseMonth) ? await loadDwellingIndex() : [];
  const estimateOf = (r: (typeof rows)[number]) => {
    const e = r.type === "real_estate" && r.purchasePrice && r.purchaseMonth ? indexRevaluation(r.purchasePrice, r.purchaseMonth, homeIndex) : null;
    return e ? { method: "index" as const, ...e } : null;
  };

  const snaps = assetSnapshots(workspaceId);
  const assets: Asset[] = rows.map((r) => {
    const quote = r.symbol ? quotes.get(r.symbol.trim().toUpperCase()) ?? null : null;
    // A live price wins; the quote's own currency (e.g. USD for AAPL) overrides the row's.
    const currency = quote?.currency ?? r.currency;
    const value = quote && r.quantity != null ? quote.price * r.quantity : r.manualValue;
    const rate = fxRate(currency, quotes);
    const valueIls = value != null && rate != null ? value * rate : null;
    const costRate = fxRate(r.currency, quotes);
    const split = valueIls != null && r.costBasis != null && costRate != null
      ? splitGain(valueIls, r.costBasis, costRate, r.currency === "ILS" ? null : r.costFx ?? null) : null;
    const gainIls = split?.total ?? null;
    const fxGainIls = split?.fx ?? null;
    // A study fund with an opening month turns liquid by itself six years on.
    const liquid = r.type === "study_fund" && r.purchaseMonth ? studyFundIsLiquid(r.purchaseMonth, israelToday()) : r.liquid;
    return { ...r, liquid, currency, value, valueIls, gainIls, fxGainIls, quote, fund: fundOf(r), estimate: estimateOf(r), change: lastChange(snaps.get(r.id) ?? [], valueIls) };
  });

  // Synced bank balances, as cash (an overdrawn account counts as a short-term debt).
  for (const b of listAccountBalances(workspaceId)) {
    const bank = BANK_PROVIDERS.find((p) => p.id === b.provider)?.name ?? b.provider;
    const overdrawn = b.balance < 0;
    assets.push({
      id: -b.id,
      name: `${bank} · ${b.accountNumber.slice(-4)}`,
      // The client translates the bank name; the server doesn't know the user's language.
      provider: b.provider,
      accountNumber: b.accountNumber,
      type: overdrawn ? "credit" : "cash",
      currency: "ILS",
      symbol: null,
      quantity: null,
      manualValue: Math.abs(b.balance),
      costBasis: null,
      liquid: true,
      note: null,
      feeDeposit: null,
      feeBalance: null,
      monthlyDeposit: null,
      interestRate: null,
      monthlyPayment: null,
      isLiability: overdrawn,
      value: Math.abs(b.balance),
      valueIls: Math.abs(b.balance),
      gainIls: null,
      quote: null,
      source: "bank",
      updatedAt: b.updatedAt,
    });
  }

  let total = 0, liquid = 0, liabilities = 0, mortgages = 0, deferredTax = 0;
  for (const a of assets) {
    const v = a.valueIls ?? 0;
    if (a.isLiability) {
      liabilities += v;
      if (a.type === "mortgage") mortgages += v;
      continue;
    }
    total += v;
    if (a.liquid) liquid += v;
    if (a.gainIls != null && a.gainIls > 0 && !UNTAXED.includes(a.type)) deferredTax += a.gainIls * CAPITAL_GAINS_TAX;
  }

  saveSnapshots(
    israelToday(),
    assets.flatMap((a) => (a.valueIls != null && a.id > 0 ? [{ assetId: a.id, valueIls: a.valueIls }] : []))
  );

  const netWorth = total - liabilities - deferredTax;
  saveDailyNetWorth(workspaceId, israelToday(), netWorth);

  return {
    assets,
    totals: {
      assets: total,
      liquid,
      liabilities,
      deferredTax,
      netWorth,
      // Mortgage payments are already in monthly spending, which the FI target funds; subtracting the balance too would count it twice.
      liquidNetWorth: liquid - (liabilities - mortgages) - deferredTax,
    },
    history: netWorthHistory(workspaceId),
    benchmarks: BENCHMARKS.map((s) => {
      const q = quotes.get(s.toUpperCase());
      return { symbol: s, change12m: q?.change12m ?? null, changeYtd: q?.changeYtd ?? null };
    }),
  };
}
