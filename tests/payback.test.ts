import { describe, it, expect } from "vitest";
import { coversExpense, paybackPair, type PaybackSide } from "@/lib/payback";

const side = (over: Partial<PaybackSide> = {}): PaybackSide => ({
  id: 1,
  amount: -300,
  kind: "expense",
  isExcluded: false,
  ...over,
});

const expense = side({ id: 1, amount: -300 });
const credit = side({ id: 2, amount: 150, kind: "income" });

describe("paybackPair", () => {
  it("finds the credit and the expense whichever way they are passed", () => {
    expect(paybackPair(expense, credit)).toEqual({
      ok: true,
      pair: { creditId: 2, expenseId: 1, creditAbs: 150, expenseAbs: 300 },
    });
    expect(paybackPair(credit, expense)).toEqual(paybackPair(expense, credit));
  });

  it("refuses a row paired with itself", () => {
    expect(paybackPair(expense, expense)).toEqual({ ok: false, code: "same-row" });
  });

  it("refuses transfers and hidden rows", () => {
    expect(paybackPair(expense, side({ id: 2, kind: "transfer" }))).toEqual({ ok: false, code: "transfer" });
    expect(paybackPair(expense, side({ id: 2, kind: "income", amount: 100, isExcluded: true }))).toEqual({
      ok: false,
      code: "excluded",
    });
  });

  it("refuses two expenses or two credits", () => {
    expect(paybackPair(expense, side({ id: 2, amount: -100 }))).toEqual({ ok: false, code: "not-pair" });
    expect(paybackPair(credit, side({ id: 3, amount: 90, kind: "income" }))).toEqual({ ok: false, code: "not-pair" });
  });

  it("refuses a card refund as the credit: it already nets against its own charge", () => {
    const refund = side({ id: 3, amount: 150, kind: "expense" });
    expect(paybackPair(expense, refund)).toEqual({ ok: false, code: "not-pair" });
  });
});

describe("coversExpense", () => {
  it("accepts a partial payback and a second one up to the full amount", () => {
    expect(coversExpense(300, 0, 150)).toBe(true);
    expect(coversExpense(300, 150, 150)).toBe(true);
  });

  it("refuses more than the expense is worth", () => {
    expect(coversExpense(300, 150, 200)).toBe(false);
    expect(coversExpense(300, 0, 301)).toBe(false);
  });

  it("tolerates float noise up to a cent and refuses a non-positive credit", () => {
    expect(coversExpense(0.3, 0.2, 0.1)).toBe(true);
    expect(coversExpense(300, 0, 0)).toBe(false);
    expect(coversExpense(0, 0, 100)).toBe(false);
  });
});
