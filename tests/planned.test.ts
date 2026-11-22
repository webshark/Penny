import { expect, it } from "vitest";
import {
  cardTiming,
  isOverdue,
  nextPayment,
  plannedCandidates,
  plannedPayments,
  plannedSpend,
  type PlannedCharge,
} from "@/lib/planned";

const bankItem = {
  id: 1,
  description: "Sofa",
  amount: 1000,
  date: "2026-01-31",
  account: "123",
  accountKind: "bank" as const,
  installments: 3,
};

it("splits a bank purchase into monthly payments, keeping the rounding remainder last", () => {
  const payments = plannedPayments(bankItem, null);
  expect(payments.map((p) => p.spendDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  expect(payments.map((p) => p.amount)).toEqual([333.33, 333.33, 333.34]);
  expect(payments.every((p) => p.chargeMonth == null)).toBe(true);
});

it("puts card payments on the estimated statement date, one per statement", () => {
  const item = { ...bankItem, accountKind: "card" as const, date: "2026-01-15", installments: 2, amount: 900 };
  const payments = plannedPayments(item, { lag: 1, day: 10 });
  expect(payments.map((p) => p.spendDate)).toEqual(["2026-02-10", "2026-03-10"]);
  expect(payments.map((p) => p.chargeMonth)).toEqual(["2026-02", "2026-03"]);
  expect(payments.map((p) => p.amount)).toEqual([450, 450]);
});

it("keeps a single card payment on its purchase date but charges it on the statement date", () => {
  const item = { ...bankItem, accountKind: "card" as const, date: "2026-01-15", installments: 1 };
  const [payment] = plannedPayments(item, { lag: 1, day: 10 });
  expect(payment.spendDate).toBe("2026-01-15");
  expect(payment.chargeDate).toBe("2026-02-10");
});

it("learns a card's lag and statement day from its own rows", () => {
  const rows: PlannedCharge[] = [
    { id: 1, description: "a", date: "2025-11-03", billingDate: "2025-12-10", account: "card", amount: 100, installmentNumber: null },
    { id: 2, description: "b", date: "2025-12-05", billingDate: "2026-01-10", account: "card", amount: 100, installmentNumber: null },
    { id: 3, description: "c", date: "2026-01-02", billingDate: "2026-02-12", account: "card", amount: 100, installmentNumber: null },
  ];
  expect(cardTiming(rows, "card")).toEqual({ lag: 1, day: 10 });
  expect(cardTiming([], "card", 9)).toEqual({ lag: 1, day: 9 });
});

it("finds real rows by account, amount, date window and text", () => {
  const item = {
    id: 1,
    amount: 1000,
    date: "2026-03-10",
    account: "A",
    accountKind: "card" as const,
    installments: 2,
    matchPattern: "ikea",
    rejectedTxnIds: [4],
  };
  const charges: PlannedCharge[] = [
    { id: 1, description: "IKEA TLV", date: "2026-03-12", billingDate: "2026-04-10", account: "A", amount: 1000, installmentNumber: null },
    { id: 2, description: "IKEA", date: "2026-03-11", billingDate: "2026-04-10", account: "A", amount: 500, installmentNumber: 1 },
    { id: 3, description: "IKEA", date: "2026-03-11", billingDate: "2026-04-10", account: "B", amount: 1000, installmentNumber: null },
    { id: 4, description: "IKEA", date: "2026-03-11", billingDate: "2026-04-10", account: "A", amount: 1000, installmentNumber: null },
    { id: 5, description: "IKEA", date: "2026-03-11", billingDate: "2026-04-10", account: "A", amount: 500, installmentNumber: 2 },
    { id: 6, description: "Other", date: "2026-03-11", billingDate: "2026-04-10", account: "A", amount: 1000, installmentNumber: null },
  ];
  const candidates = plannedCandidates(item, charges, new Set([2]));
  expect(candidates.map((c) => c.id)).toEqual([1]);
});

it("flags an item overdue only after the matching window and while still planned", () => {
  expect(isOverdue({ status: "planned", date: "2026-01-01" }, "2026-03-01")).toBe(true);
  expect(isOverdue({ status: "matched", date: "2026-01-01" }, "2026-03-01")).toBe(false);
  expect(isOverdue({ status: "planned", date: "2026-02-20" }, "2026-03-01")).toBe(false);
});

it("counts only planned payments in range, moving a missed date to today", () => {
  const items = [
    { ...bankItem, id: 1, status: "planned" as const },
    { ...bankItem, id: 2, status: "matched" as const },
  ];
  const timings = new Map<number, null>();
  const spend = plannedSpend(items, timings, "2026-02-01", "2026-03-31", "2026-02-15");
  expect(spend.map((p) => p.spendDate)).toEqual(["2026-02-15", "2026-02-28", "2026-03-31"]);
});

it("picks the next payment that has not left the account yet", () => {
  const payments = plannedPayments(bankItem, null);
  expect(nextPayment(payments, "2026-02-10")?.spendDate).toBe("2026-02-28");
  expect(nextPayment(payments, "2026-04-01")).toBeNull();
});
