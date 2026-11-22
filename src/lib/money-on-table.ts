import type { Suggestion } from "./suggestions";
import { BENCHMARK_FEES } from "./plan";
import { insuranceOverlaps } from "./insurance";
import type { InsurancePolicy } from "./types";
import { IL } from "./il-defaults";

/**
 * "Money on the table": every check that found shekels, as one yearly figure with the step that gets them.
 * Estimates, not advice. Items the user marked done leave the list and count as saved.
 */
export type TableKind = "fees" | "interest" | "fx" | "fxMarkup" | "leak" | "idle" | "taxRefund" | "fundFee" | "insurance" | "donationCredit";

export interface TableItem {
  key: string;
  kind: TableKind;
  /** ₪ a year; null when the size can't be estimated (a tax refund depends on the whole year's payslips). */
  yearly: number | null;
  href: string;
  /** A merchant, fund or policy names, for the label. */
  name?: string;
}

export interface DoneSaving { key: string; yearly: number }

type FundAsset = { id: number; name: string; type: string; valueIls: number | null; monthlyDeposit: number | null; feeDeposit: number | null; feeBalance: number | null };
type Policy = Pick<InsurancePolicy, "name" | "kind" | "insured" | "monthlyPremium"> & { archived?: boolean };

/** Below this a fund's extra fee isn't worth a phone call. */
const MIN_FUND_GAP = 100;

/** What this year's fees cost over the market benchmark: % of balance plus % of a year's deposits. */
export function fundFeeGap(a: FundAsset): number {
  const bench = BENCHMARK_FEES[a.type];
  if (!bench || !a.valueIls || a.valueIls <= 0) return 0;
  const onBalance = a.valueIls * Math.max(0, (a.feeBalance ?? 0) - bench.balance) / 100;
  const onDeposits = (a.monthlyDeposit ?? 0) * 12 * Math.max(0, (a.feeDeposit ?? 0) - bench.deposit) / 100;
  return Math.round(onBalance + onDeposits);
}

function fromSuggestion(s: Suggestion): TableItem | null {
  switch (s.type) {
    case "fees": return { key: s.key, kind: "fees", yearly: Math.round(s.yearly), href: "/transactions" };
    case "interest": return { key: s.key, kind: "interest", yearly: Math.round(s.yearly), href: "/loans" };
    case "fx": return { key: s.key, kind: "fx", yearly: Math.round(s.yearly), href: "/transactions" };
    case "fxMarkup": return { key: s.key, kind: "fxMarkup", yearly: Math.round(s.total), href: "/transactions" };
    case "leak": return { key: s.key, kind: "leak", yearly: Math.round(s.monthly * 12), href: "/recurring", name: s.name };
    // What a money-market fund would earn on cash above the buffer (same rate the suggestions feed uses).
    case "idle": return { key: s.key, kind: "idle", yearly: Math.round(s.amount * 0.04), href: "/investments" };
    case "taxRefund": return { key: s.key, kind: "taxRefund", yearly: null, href: "/calculators/credit-points", name: String(s.year) };
    default: return null;
  }
}

export function moneyOnTable(input: { suggestions: Suggestion[]; assets: FundAsset[]; policies: Policy[]; done: DoneSaving[]; donations?: { year: number; total: number }[]; today?: string }) {
  const doneKeys = new Set(input.done.map((d) => d.key));
  const items: TableItem[] = [];
  for (const s of input.suggestions) {
    const item = fromSuggestion(s);
    if (item) items.push(item);
  }
  for (const a of input.assets) {
    const gap = fundFeeGap(a);
    if (gap >= MIN_FUND_GAP) items.push({ key: `fundFee:${a.id}`, kind: "fundFee", yearly: gap, href: "/investments", name: a.name });
  }
  // Donations last tax year: a 35% credit (§46) most employees only get by asking for it. Capped at 30% of income,
  // which only very large donors reach, so it isn't modelled here.
  const lastYear = Number((input.today ?? new Date().toISOString()).slice(0, 4)) - 1;
  const gave = input.donations?.find((d) => d.year === lastYear)?.total ?? 0;
  if (gave > IL.donationCredit.min) {
    items.push({ key: `donation:${lastYear}`, kind: "donationCredit", yearly: Math.round(gave * IL.donationCredit.rate), href: "/calculators/credit-points", name: String(lastYear) });
  }
  const active = input.policies.filter((p) => !p.archived);
  for (const o of insuranceOverlaps(active)) {
    // The policy that could go: for private surgery cover next to health insurance it's the shaban plan; otherwise one of the
    // same kind. Only that person's policies, so another member's cheaper policy never sets the figure.
    const kind = o.kind === "shaban" ? "shaban" : o.policyKind;
    const premiums = active
      .filter((p) => o.names.includes(p.name) && (p.insured ?? "").trim() === o.who && (p.kind === kind || (kind === "life" && p.kind === "mortgage_life")))
      .map((p) => p.monthlyPremium)
      .sort((x, y) => x - y);
    // Life cover legitimately adds up, so it gets no figure; otherwise the cheapest overlapping policy is the conservative saving.
    const yearly = o.kind === "life" || premiums.length === 0 ? null : Math.round(premiums[0] * 12);
    items.push({ key: `insurance:${o.kind}:${o.policyKind}:${o.who}`, kind: "insurance", yearly, href: "/insurance", name: o.names.join(", ") });
  }
  const open = items
    .filter((i) => !doneKeys.has(i.key) && (i.yearly == null || i.yearly > 0))
    .sort((a, b) => (b.yearly ?? -1) - (a.yearly ?? -1));
  return {
    items: open,
    total: open.reduce((s, i) => s + (i.yearly ?? 0), 0),
    saved: input.done.reduce((s, d) => s + Math.max(0, d.yearly), 0),
  };
}
