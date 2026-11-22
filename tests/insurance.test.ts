import { expect, it } from "vitest";
import {
  daysUntil,
  insuranceOverlaps,
  insuranceTotals,
  monthlyPremium,
  policyMatchesCharge,
  renewalDay,
  renewalSoon,
  sortPolicies,
  summarizePayments,
  unlinkedCharges,
} from "@/lib/insurance";
import type { InsurancePolicyView } from "@/lib/types";

const day = (iso: string) => new Date(`${iso}T00:00:00`);

const view = (over: Partial<InsurancePolicyView>): InsurancePolicyView => ({
  id: 1,
  name: "Policy",
  kind: "health",
  provider: null,
  monthlyPremium: 0,
  renewalMonth: null,
  insured: null,
  archived: false,
  documents: [],
  payments: { last12: 0, count: 0, lastDate: null, lastAmount: null },
  renewalSoon: false,
  ...over,
});

it("matches a charge by its text and, when set, its account", () => {
  const policy = { matchPattern: "הפניקס", paymentAccount: "" };
  expect(policyMatchesCharge(policy, { description: "הפניקס ביטוח חיים", account: "12-345" })).toBe(true);
  expect(policyMatchesCharge(policy, { description: "הפניקס ביטוח חיים", account: "999" })).toBe(true);
  expect(policyMatchesCharge(policy, { description: "מכולת", account: "12-345" })).toBe(false);
  // No match text never claims a charge.
  expect(policyMatchesCharge({ matchPattern: "", paymentAccount: "" }, { description: "x", account: "y" })).toBe(false);
  // An account on the policy narrows the match.
  expect(
    policyMatchesCharge({ matchPattern: "הפניקס", paymentAccount: "12-345" }, { description: "הפניקס", account: "999" })
  ).toBe(false);
});

it("sums what was actually paid, ignoring refunds for the count", () => {
  const summary = summarizePayments([
    { amount: 210.5, date: "2026-01-05" },
    { amount: 210.5, date: "2026-02-05" },
    { amount: -60, date: "2026-03-01" },
  ]);
  expect(summary.last12).toBe(361);
  expect(summary.count).toBe(2);
  expect(summary.lastDate).toBe("2026-03-01");
  expect(summary.lastAmount).toBe(-60);
});

it("lists insurance charges no active policy explains, largest first", () => {
  const charges = [
    { id: 1, description: "הפניקס", date: "2026-01-05", account: "A", amount: 100 },
    { id: 2, description: "הפניקס", date: "2026-02-05", account: "A", amount: 100 },
    { id: 3, description: "כלל", date: "2026-02-06", account: "B", amount: 300 },
    { id: 4, description: "כלל", date: "2026-02-07", account: "B", amount: -300 },
    { id: 5, description: "מנורה", date: "2026-02-08", account: "A", amount: 40 },
  ];
  const policies = [{ matchPattern: "הפניקס", paymentAccount: "", archived: false }];
  const out = unlinkedCharges(charges, policies);
  // כלל nets to zero and drops out; מנורה is the only unexplained group.
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ description: "מנורה", account: "A", count: 1, total: 40 });
});

it("keeps the same text on two accounts apart", () => {
  const out = unlinkedCharges(
    [
      { id: 1, description: "כלל", date: "2026-01-05", account: "A", amount: 100 },
      { id: 2, description: "כלל", date: "2026-01-05", account: "B", amount: 80 },
    ],
    []
  );
  expect(out.map((g) => g.account).sort()).toEqual(["A", "B"]);
});

it("derives the renewal day from an end date, then a renewal month", () => {
  expect(renewalDay({ endDate: "2027-03-14T00:00:00", renewalMonth: null })).toBe("2027-03-14");
  expect(renewalDay({ endDate: null, renewalMonth: "2026-09" })).toBe("2026-09-01");
  expect(renewalDay({ endDate: null, renewalMonth: null })).toBeNull();
});

it("flags renewals within the window and not in the past", () => {
  const today = day("2026-11-16");
  expect(daysUntil("2026-12-01", today)).toBe(15);
  expect(renewalSoon({ endDate: null, renewalMonth: "2026-12", archived: false }, today)).toBe(true);
  expect(renewalSoon({ endDate: null, renewalMonth: "2026-10", archived: false }, today)).toBe(false);
  expect(renewalSoon({ endDate: null, renewalMonth: "2027-06", archived: false }, today)).toBe(false);
  // Archived policies never remind.
  expect(renewalSoon({ endDate: null, renewalMonth: "2026-12", archived: true }, today)).toBe(false);
});

it("turns a yearly or one-off premium into a monthly cost", () => {
  expect(monthlyPremium(1200, "yearly")).toBe(100);
  expect(monthlyPremium(250, "monthly")).toBe(250);
  expect(monthlyPremium(5000, "one_time")).toBe(0);
  expect(monthlyPremium(-30, "monthly")).toBe(0);
});

it("totals only the active policies", () => {
  const totals = insuranceTotals([
    view({ id: 1, monthlyPremium: 100, archived: false, renewalSoon: true, documents: [viewDoc(1)] }),
    view({ id: 2, monthlyPremium: 50, archived: false }),
    view({ id: 3, monthlyPremium: 999, archived: true }),
  ]);
  expect(totals.count).toBe(2);
  expect(totals.monthly).toBe(150);
  expect(totals.renewalsSoon).toBe(1);
  expect(totals.documents).toBe(1);
});

it("sorts by renewal date, archived last", () => {
  const sorted = sortPolicies([
    view({ id: 1, name: "b", renewalMonth: "2027-01" }),
    view({ id: 2, name: "a", renewalMonth: "2026-12" }),
    view({ id: 3, name: "z", archived: true }),
    view({ id: 4, name: "c", renewalMonth: null }),
  ]);
  expect(sorted.map((p) => p.id)).toEqual([2, 1, 4, 3]);
});

it("spots household overlaps without double counting the household itself", () => {
  const overlaps = insuranceOverlaps([
    { name: "Health A", kind: "health", insured: "Dana" },
    { name: "Health B", kind: "health", insured: "Dana" },
    { name: "Car A", kind: "car", insured: "" },
  ]);
  expect(overlaps).toHaveLength(1);
  expect(overlaps[0]).toMatchObject({ kind: "health", who: "Dana", names: ["Health A", "Health B"] });
});

function viewDoc(id: number) {
  return {
    id,
    policyId: 1,
    fileName: "f.pdf",
    originalName: "f.pdf",
    mime: "application/pdf",
    size: 10,
    kind: "policy" as const,
    uploadedAt: "2026-01-01",
  };
}
