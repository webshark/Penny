import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { detectKind } from "@/server/lib/transfers";

describe("detectKind", () => {
  it("treats a loan deposit as a transfer, not income", () => {
    expect(detectKind("הלוואה מהבנק", "hapoalim", 20000)).toBe("transfer");
    expect(detectKind("Loan disbursement", "leumi", 5000)).toBe("transfer");
  });

  it("keeps salary as income and loan repayments as expenses", () => {
    expect(detectKind("משכורת", "hapoalim", 15000)).toBe("income");
    expect(detectKind("החזר הלוואה", "hapoalim", -1200)).toBe("expense");
  });

  it("calls a card bill a transfer only when a card scraper explains it", () => {
    expect(detectKind("חיוב כרטיס ויזה 1234", "hapoalim", -2400, { cardExplainsBill: true })).toBe("transfer");
    // Without a connected card the debit is real spending; hiding it understated every month.
    expect(detectKind("חיוב כרטיס ויזה 1234", "hapoalim", -2400)).toBe("expense");
    expect(detectKind("ISRACARD", "leumi", -900, { cardExplainsBill: false })).toBe("expense");
  });

  it("knows Max's Hebrew bill names, without catching other words", () => {
    for (const d of ["מקס איט פיננסים", "מקס-איט", "לאומי קארד", "מקס", "אמקס"]) expect(detectKind(d, "leumi", -3200, { cardExplainsBill: true })).toBe("transfer");
    for (const d of ["מקסים רסטורנט", "מקסי פוד"]) expect(detectKind(d, "leumi", -80, { cardExplainsBill: true })).toBe("expense");
  });

  it("leaves card-provider rows as expenses, refunds included", () => {
    expect(detectKind("חיוב כרטיס", "isracard", 120)).toBe("expense");
  });
});
