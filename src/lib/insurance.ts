/** Insurance policy logic: matching premiums on the statement, totals and renewals. Estimates, not advice. */
import type {
  InsurancePayments,
  InsurancePolicy,
  InsurancePolicyView,
  InsuranceUnlinkedCharge,
} from "./types";

export type OverlapKind = "health" | "shaban" | "life" | "same";

export interface Overlap {
  kind: OverlapKind;
  /** Who the policies cover, as typed; "" is the whole household. */
  who: string;
  /** Policy kind for "same" (e.g. "car"); otherwise the kind that triggered it. */
  policyKind: InsurancePolicy["kind"];
  names: string[];
}

type P = Pick<InsurancePolicy, "name" | "kind" | "insured">;

export function insuranceOverlaps(policies: P[]): Overlap[] {
  const byWho = new Map<string, P[]>();
  for (const p of policies) {
    const who = (p.insured ?? "").trim();
    byWho.set(who, [...(byWho.get(who) ?? []), p]);
  }
  const out: Overlap[] = [];
  for (const [who, list] of byWho) {
    const of = (...kinds: string[]) => list.filter((p) => kinds.includes(p.kind));
    const names = (ps: P[]) => ps.map((p) => p.name);
    const health = of("health"), shaban = of("shaban"), life = of("life", "mortgage_life");
    // Indemnity health cover pays once, however many policies pay for it.
    if (health.length > 1) out.push({ kind: "health", who, policyKind: "health", names: names(health) });
    // Private surgery cover often repeats what the health fund's supplementary plan already gives.
    if (health.length > 0 && shaban.length > 0) out.push({ kind: "shaban", who, policyKind: "shaban", names: names([...health, ...shaban]) });
    // Life cover does add up, but two policies plus the mortgage's is often more than the family needs.
    if (life.length > 1) out.push({ kind: "life", who, policyKind: "life", names: names(life) });
    for (const k of ["disability", "long_term_care", "home", "car", "travel"] as const) {
      const same = of(k);
      if (same.length > 1) out.push({ kind: "same", who, policyKind: k, names: names(same) });
    }
  }
  return out;
}

/** The Capital Market Authority's official lookup of every policy in your name. */
export const HAR_HABITUACH_URL = "https://harb.cma.gov.il/";

/** A transaction that may be a premium: one debit (refunds are negative). */
export interface InsuranceCharge {
  id: number;
  description: string;
  /** YYYY-MM-DD. */
  date: string;
  account: string;
  amount: number;
}

const INSURANCE_CATEGORY = /ביטוח|insurance/i;

/** A category (or its parent) that is about insurance. */
export function isInsuranceCategory(name: string | null | undefined): boolean {
  return !!name && INSURANCE_CATEGORY.test(name);
}

function patternOf(policy: Pick<InsurancePolicy, "matchPattern">): string {
  return (policy.matchPattern ?? "").trim().toLowerCase();
}

/**
 * A charge belongs to a policy when its description contains the policy's match
 * text and, if the policy names a paying account, it comes from that account.
 * No match text means no claim on any charge: never match everything.
 */
export function policyMatchesCharge(
  policy: Pick<InsurancePolicy, "matchPattern" | "paymentAccount">,
  charge: Pick<InsuranceCharge, "description" | "account">
): boolean {
  const pattern = patternOf(policy);
  if (!pattern) return false;
  if (!charge.description.toLowerCase().includes(pattern)) return false;
  const account = (policy.paymentAccount ?? "").trim();
  return !account || account === charge.account;
}

/** What the household actually paid for a policy in the given charges. */
export function summarizePayments(charges: Pick<InsuranceCharge, "amount" | "date">[]): InsurancePayments {
  let total = 0, count = 0;
  let lastDate: string | null = null, lastAmount: number | null = null;
  for (const c of charges) {
    total += c.amount;
    if (c.amount > 0) count++;
    if (!lastDate || c.date > lastDate) {
      lastDate = c.date;
      lastAmount = c.amount;
    }
  }
  return { last12: round(total), count, lastDate, lastAmount };
}

/** Insurance charges no active policy explains, grouped by description and account. */
export function unlinkedCharges(
  charges: InsuranceCharge[],
  policies: Pick<InsurancePolicy, "matchPattern" | "paymentAccount" | "archived">[]
): InsuranceUnlinkedCharge[] {
  const active = policies.filter((p) => !p.archived);
  const groups = new Map<string, InsuranceUnlinkedCharge>();
  for (const c of charges) {
    if (active.some((p) => policyMatchesCharge(p, c))) continue;
    // The same text on two cards is two different things (his and hers at one insurer).
    const key = `${c.description}|${c.account}`;
    const g = groups.get(key) ?? { description: c.description, account: c.account, count: 0, total: 0, lastDate: "", lastAmount: 0 };
    g.count++;
    g.total = round(g.total + c.amount);
    if (!g.lastDate || c.date > g.lastDate) {
      g.lastDate = c.date;
      g.lastAmount = c.amount;
    }
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
}

export function insuranceTotals(policies: InsurancePolicyView[]) {
  const current = policies.filter((p) => !p.archived);
  return {
    count: current.length,
    monthly: round(current.reduce((s, p) => s + p.monthlyPremium, 0)),
    paidLast12: round(current.reduce((s, p) => s + p.payments.last12, 0)),
    renewalsSoon: current.filter((p) => p.renewalSoon).length,
    documents: current.reduce((s, p) => s + p.documents.length, 0),
  };
}

/** The first day of a YYYY-MM renewal. */
export function renewalDay(policy: Pick<InsurancePolicy, "endDate" | "renewalMonth">): string | null {
  if (policy.endDate) return policy.endDate.slice(0, 10);
  if (policy.renewalMonth) return `${policy.renewalMonth.slice(0, 7)}-01`;
  return null;
}

/** daysUntil changes, so callers pass "today" for a stable answer in tests. */
export function daysUntil(day: string, today: Date): number {
  const target = new Date(`${day}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Renews within `days`, and not already behind us. */
export function renewalSoon(
  policy: Pick<InsurancePolicy, "endDate" | "renewalMonth" | "archived">,
  today = new Date(),
  days = 60
): boolean {
  if (policy.archived) return false;
  const day = renewalDay(policy);
  if (!day) return false;
  const left = daysUntil(day, today);
  return left >= 0 && left <= days;
}

/** A yearly or one-off premium as a monthly cost, for the form. */
export function monthlyPremium(amount: number, frequency: "monthly" | "yearly" | "one_time"): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (frequency === "yearly") return round(amount / 12);
  if (frequency === "one_time") return 0;
  return round(amount);
}

/** Nearest renewals first, then policies with no renewal date. */
export function sortPolicies(policies: InsurancePolicyView[]): InsurancePolicyView[] {
  return [...policies].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    const da = renewalDay(a), db = renewalDay(b);
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return a.name.localeCompare(b.name);
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
