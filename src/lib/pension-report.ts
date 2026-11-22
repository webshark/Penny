/**
 * A pension / long-term savings report as an insurance agent or advisor sends it, extracted to JSON
 * (see docs/pension-report.md and public/pension-report.example.json). The app never reads the PDF
 * itself: any extraction tool can produce this shape. Products become assets, the insurance in the
 * report becomes policies, and the report's own totals are checked so a bad extraction is refused
 * instead of quietly imported. Pure functions, so they can be tested without a database.
 */
import { POLICY_KINDS, type InsurancePolicy } from "./types";

export const PENSION_PRODUCT_TYPES = ["pension", "keren_hishtalmut", "kupat_gemel"] as const;
export type PensionProductType = (typeof PENSION_PRODUCT_TYPES)[number];

/** Yearly returns as the report prints them (1 year, 3, 5, ...), oldest figure first. */
export type PensionReturns = (number | null)[];

export interface PensionTrack {
  name: string;
  /** Percent of the product's balance. */
  share: number | null;
  balance: number | null;
  returns: PensionReturns;
}

export interface PensionProduct {
  type: PensionProductType;
  name: string;
  provider: string;
  policyNumber: string;
  balance: number;
  /** Management fees, % a year. */
  feeDeposit: number | null;
  feeBalance: number | null;
  employer: string | null;
  status: "active" | "inactive";
  joinDate: string | null;
  lastDeposit: string | null;
  regularDeposit: number | null;
  insuredSalary: number | null;
  /** Expected monthly pension at retirement, in today's terms. */
  expectedAnnuity: number | null;
  expectedAnnuityWithDeposits: number | null;
  agentOfRecord: string | null;
  tracks: PensionTrack[];
  components: { pitzuyim: number | null; tagmulim: number | null; capital: number | null } | null;
  coverages: { name: string; pct: number | null; monthly: number | null }[];
  coverageCost: { disability: number | null; survivors: number | null } | null;
}

export interface PensionReportInsurance {
  name: string;
  kind: InsurancePolicy["kind"];
  provider: string;
  policyNumber: string;
  /** Monthly premium in ILS; a yearly premium is already divided by 12. */
  premium: number;
  startDate: string | null;
  /** Text that identifies the charge on the statement. */
  matchPattern: string | null;
  coverage: number | null;
  notes: string | null;
}

export interface PensionReport {
  asOf: string;
  member: string;
  source: string;
  file: string | null;
  issuedAt: string | null;
  agent: { name: string; agency: string | null; phone: string | null; email: string | null } | null;
  totalSavings: number;
  /** Everything else the report's summary carried, kept as-is for the record. */
  summary: Record<string, unknown>;
  products: PensionProduct[];
  insurance: PensionReportInsurance[];
}

const MAX_PRODUCTS = 200;
const MAX_INSURANCE = 50;
/** Same ceiling the asset form uses, so an import cannot bring in a value the form would reject. */
const MAX_AMOUNT = 1e10;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** A number, null when absent, undefined when it is not a usable amount. */
function optNum(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n < MAX_AMOUNT ? n : undefined;
}

/** True for a real calendar day written YYYY-MM-DD (so 2026-02-30 is refused). */
export function isReportDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DAY.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The marker kept in the asset's note, so importing the same report again updates instead of duplicating. */
export function reportAssetKey(p: PensionProduct): string {
  return `pension-report:${p.provider}:${p.policyNumber}:${p.type}:${p.name}`;
}

export function reportAssetType(p: PensionProduct): "pension" | "study_fund" | "provident" {
  return p.type === "keren_hishtalmut" ? "study_fund" : p.type === "kupat_gemel" ? "provident" : "pension";
}

/** The name seen in the investments list: provider product, employer when the report names one, last digits of the number. */
export function reportAssetName(p: PensionProduct): string {
  const tail = p.policyNumber.replace(/\D/g, "").slice(-4);
  return `${p.name}${p.employer ? ` — ${p.employer}` : ""}${tail ? ` ···${tail}` : ""}`.slice(0, 100);
}

/** What the report adds beyond the asset columns: tracks, components, cover, expected annuity. */
export function reportDetails(p: PensionProduct, asOf: string): Record<string, unknown> {
  return {
    provider: p.provider,
    policyNumber: p.policyNumber,
    status: p.status,
    joinDate: p.joinDate,
    employer: p.employer,
    lastDeposit: p.lastDeposit,
    insuredSalary: p.insuredSalary,
    expectedAnnuity: p.expectedAnnuity,
    expectedAnnuityWithDeposits: p.expectedAnnuityWithDeposits,
    agentOfRecord: p.agentOfRecord,
    tracks: p.tracks,
    components: p.components,
    coverages: p.coverages,
    coverageCost: p.coverageCost,
    reportAsOf: asOf,
  };
}

/** Yearly, quarterly or monthly premium → the monthly figure Penny stores. */
function monthlyPremium(premium: number, frequency: unknown): number {
  const f = String(frequency ?? "monthly").trim().toLowerCase();
  if (f.startsWith("year") || f.startsWith("annual")) return round2(premium / 12);
  if (f.startsWith("quarter")) return round2(premium / 3);
  return round2(premium);
}

const isKind = (v: string): v is InsurancePolicy["kind"] => (POLICY_KINDS as readonly string[]).includes(v);

function parseTracks(v: unknown): PensionTrack[] {
  if (!Array.isArray(v)) return [];
  const out: PensionTrack[] = [];
  for (const entry of v.slice(0, 20)) {
    const t = (entry ?? {}) as Record<string, unknown>;
    const name = text(t.name, 80);
    if (!name) continue;
    out.push({
      name,
      share: optNum(t.share) ?? null,
      balance: optNum(t.balance) ?? null,
      returns: Array.isArray(t.returns) ? t.returns.slice(0, 10).map((r) => optNum(r) ?? null) : [],
    });
  }
  return out;
}

function parseCoverages(v: unknown): { name: string; pct: number | null; monthly: number | null }[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).flatMap((entry) => {
    const c = (entry ?? {}) as Record<string, unknown>;
    const name = text(c.name, 80);
    return name ? [{ name, pct: optNum(c.pct) ?? null, monthly: optNum(c.monthly) ?? null }] : [];
  });
}

function parseProduct(entry: unknown, index: number): PensionProduct | string {
  const p = entry as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return `product ${index + 1} must be an object`;

  const type = typeof p.type === "string" ? p.type.trim().toLowerCase() : "";
  if (!(PENSION_PRODUCT_TYPES as readonly string[]).includes(type)) {
    return `product ${index + 1}: type must be pension, keren_hishtalmut or kupat_gemel`;
  }
  const name = text(p.name, 80);
  if (!name) return `product ${index + 1}: name is required`;
  const provider = text(p.provider, 60);
  if (!provider) return `product ${index + 1}: provider is required`;
  const balance = optNum(p.balance);
  if (balance == null) return `product ${index + 1}: balance is required`;
  const feeDeposit = optNum(p.feeDeposit);
  const feeBalance = optNum(p.feeBalance);
  if (feeDeposit === undefined || (feeDeposit ?? 0) > 10) return `product ${index + 1}: feeDeposit must be a percentage up to 10`;
  if (feeBalance === undefined || (feeBalance ?? 0) > 10) return `product ${index + 1}: feeBalance must be a percentage up to 10`;

  const status = p.status === "inactive" ? "inactive" : "active";
  const components = (p.components ?? null) as Record<string, unknown> | null;
  const coverageCost = (p.coverageCost ?? null) as Record<string, unknown> | null;
  return {
    type: type as PensionProductType,
    name,
    provider,
    policyNumber: text(p.policyNumber, 40) ?? (typeof p.policyNumber === "number" ? String(p.policyNumber) : ""),
    balance,
    feeDeposit: feeDeposit ?? null,
    feeBalance: feeBalance ?? null,
    employer: text(p.employer, 80),
    status,
    joinDate: isReportDate(p.joinDate) ? p.joinDate : null,
    lastDeposit: isReportDate(p.lastDeposit) ? p.lastDeposit : null,
    regularDeposit: status === "active" ? optNum(p.regularDeposit) ?? null : null,
    insuredSalary: optNum(p.insuredSalary) ?? null,
    expectedAnnuity: optNum(p.expectedAnnuity) ?? null,
    expectedAnnuityWithDeposits: optNum(p.expectedAnnuityWithDeposits) ?? null,
    agentOfRecord: text(p.agentOfRecord, 80),
    tracks: parseTracks(p.tracks),
    components: components && typeof components === "object"
      ? { pitzuyim: optNum(components.pitzuyim) ?? null, tagmulim: optNum(components.tagmulim) ?? null, capital: optNum(components.capital) ?? null }
      : null,
    coverages: parseCoverages(p.coverages),
    coverageCost: coverageCost && typeof coverageCost === "object"
      ? { disability: optNum(coverageCost.disability) ?? null, survivors: optNum(coverageCost.survivors) ?? null }
      : null,
  };
}

function parseInsurance(entry: unknown, index: number): PensionReportInsurance | string {
  const o = entry as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) return `insurance ${index + 1} must be an object`;
  const name = text(o.name, 80);
  if (!name) return `insurance ${index + 1}: name is required`;
  const provider = text(o.insurer ?? o.provider, 60);
  if (!provider) return `insurance ${index + 1}: insurer is required`;
  const premium = optNum(o.premium ?? o.monthlyPremium);
  if (premium == null) return `insurance ${index + 1}: premium is required`;
  const kind = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  const coverage = optNum(o.coverage);
  return {
    name,
    kind: isKind(kind) ? kind : "other",
    provider,
    policyNumber: text(o.policyNumber, 40) ?? (typeof o.policyNumber === "number" ? String(o.policyNumber) : ""),
    premium: monthlyPremium(premium, o.premiumFrequency),
    startDate: isReportDate(o.startDate) ? o.startDate : null,
    matchPattern: text(o.matchPattern, 60),
    coverage: coverage === undefined ? null : coverage,
    notes: text(o.notes ?? o.coverageText, 300),
  };
}

/** Validate an extracted report. Returns the clean report, or a message saying what to fix. */
export function parsePensionReport(raw: unknown): PensionReport | string {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return "the report must be a JSON object";
  if (!isReportDate(r.asOf)) return "asOf must be a real date like 2026-06-30";

  const summary = r.summary as Record<string, unknown> | null;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "summary is required";
  const totalSavings = optNum(summary.totalSavings);
  if (totalSavings == null) return "summary.totalSavings is required, to check the products against";

  const list = r.products;
  if (!Array.isArray(list) || list.length === 0) return "products must be a non-empty list";
  if (list.length > MAX_PRODUCTS) return `a report can hold at most ${MAX_PRODUCTS} products`;

  const products: PensionProduct[] = [];
  const keys = new Set<string>();
  for (const [i, entry] of list.entries()) {
    const p = parseProduct(entry, i);
    if (typeof p === "string") return p;
    const key = reportAssetKey(p);
    if (keys.has(key)) return `two products share the same provider, policy number and type (${p.name})`;
    keys.add(key);
    products.push(p);
  }

  // The report's own total is the cheapest protection against a bad extraction.
  const sum = round2(products.reduce((s, p) => s + p.balance, 0));
  if (Math.abs(sum - totalSavings) > 2) {
    return `products add up to ${sum}, the report says ${totalSavings} — check the extraction`;
  }

  const insurance: PensionReportInsurance[] = [];
  if (r.insurance != null) {
    if (!Array.isArray(r.insurance)) return "insurance must be a list";
    if (r.insurance.length > MAX_INSURANCE) return `a report can hold at most ${MAX_INSURANCE} insurance policies`;
    for (const [i, entry] of r.insurance.entries()) {
      const ins = parseInsurance(entry, i);
      if (typeof ins === "string") return ins;
      insurance.push(ins);
    }
  }

  const agent = r.agent as Record<string, unknown> | null;
  return {
    asOf: r.asOf,
    member: text(r.member, 80) ?? "",
    source: text(r.source, 120) ?? "",
    file: text(r.file, 200),
    issuedAt: isReportDate(r.issuedAt) ? r.issuedAt : null,
    agent: agent && typeof agent === "object"
      ? { name: text(agent.name, 80) ?? "", agency: text(agent.agency, 80), phone: text(agent.phone, 40), email: text(agent.email, 120) }
      : null,
    totalSavings,
    summary,
    products,
    insurance,
  };
}
