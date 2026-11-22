import "server-only";

import { POLICY_KINDS, type InsurancePolicy } from "@/lib/types";
import type { InsurancePolicyInput } from "@/server/db/queries/insurance";

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const amount = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? n : null;
};
const day = (v: unknown): string | null | undefined => {
  if (v === "" || v === null || v === undefined) return null;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
};
const month = (v: unknown): string | null | undefined => {
  if (v === "" || v === null || v === undefined) return null;
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : undefined;
};

/** Validates the policy form. Returns a message in English (the API's language) or the clean input. */
export function parsePolicyInput(body: unknown): InsurancePolicyInput | string {
  const item = (body ?? {}) as Record<string, unknown>;
  const id = item.id == null ? undefined : Number(item.id);
  if (id !== undefined && !Number.isInteger(id)) return "invalid id";

  const name = text(item.name, 60);
  const kind = POLICY_KINDS.find((k) => k === item.kind) as InsurancePolicy["kind"] | undefined;
  const monthlyPremium = amount(item.monthlyPremium);
  if (!name) return "a policy needs a name";
  if (!kind) return "unknown policy kind";
  if (monthlyPremium == null) return "monthly premium must be a non-negative amount";

  const renewalMonth = month(item.renewalMonth);
  if (renewalMonth === undefined) return "renewal month must be YYYY-MM";
  const startDate = day(item.startDate);
  if (startDate === undefined) return "start date must be YYYY-MM-DD";
  const endDate = day(item.endDate);
  if (endDate === undefined) return "end date must be YYYY-MM-DD";
  if (startDate && endDate && endDate < startDate) return "end date is before the start date";

  const coverage = amount(item.coverage);
  if (coverage == null && item.coverage !== "" && item.coverage != null) return "coverage must be a non-negative amount";
  const deductible = amount(item.deductible);
  if (deductible == null && item.deductible !== "" && item.deductible != null) return "deductible must be a non-negative amount";

  return {
    id,
    name,
    kind,
    provider: text(item.provider, 60),
    monthlyPremium,
    renewalMonth,
    insured: text(item.insured, 40),
    policyNumber: text(item.policyNumber, 40),
    paymentAccount: text(item.paymentAccount, 40),
    matchPattern: text(item.matchPattern, 60),
    startDate,
    endDate,
    coverage,
    deductible,
    agentName: text(item.agentName, 60),
    agentPhone: text(item.agentPhone, 40),
    notes: text(item.notes, 500),
    archived: item.archived === true,
  };
}

/** Body of a document: { kind } only; the file carries the rest. */
export function parseDocumentKind(value: unknown): "policy" | "appendix" | "renewal" | "claim" | "other" | null {
  return value === "policy" || value === "appendix" || value === "renewal" || value === "claim" || value === "other" ? value : null;
}
