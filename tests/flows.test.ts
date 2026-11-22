import { describe, expect, it } from "vitest";
import { SPEND_FLOWS, cashAmount, classifyFlow, isSpendFlow } from "@/lib/flows";

describe("classifyFlow", () => {
  it("separates income, spending and money moving between our own accounts", () => {
    expect(classifyFlow({ kind: "income", chargedAmount: 15000 })).toBe("income");
    expect(classifyFlow({ kind: "transfer", chargedAmount: -2400 })).toBe("transfer_internal");
    expect(classifyFlow({ kind: "expense", chargedAmount: -80 })).toBe("expense");
  });

  it("treats a positive card row as a refund, never as income", () => {
    expect(classifyFlow({ kind: "expense", chargedAmount: 250 })).toBe("refund");
  });

  it("keeps the spending list to flows that belong in a budget", () => {
    expect(SPEND_FLOWS).toContain("refund");
    expect(SPEND_FLOWS).not.toContain("income");
    expect(isSpendFlow("transfer_internal")).toBe(false);
    expect(isSpendFlow("expense")).toBe(true);
  });
});

describe("cashAmount", () => {
  it("is neutral for internal transfers and borrowed principal", () => {
    expect(cashAmount("transfer_internal", -1000)).toBe(0);
    expect(cashAmount("loan_drawdown", 20000)).toBe(0);
  });

  it("keeps the sign of real income, spending and refunds", () => {
    expect(cashAmount("income", 15000)).toBe(15000);
    expect(cashAmount("expense", -80)).toBe(-80);
    expect(cashAmount("refund", 250)).toBe(250);
  });
});
