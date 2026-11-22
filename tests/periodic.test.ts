import { describe, expect, it } from "vitest";
import { detectPeriodic, monthlySetAside, monthsUntil, nextDueFrom, totalSetAside, type PeriodicExpense } from "@/lib/periodic";

const item = (p: Partial<PeriodicExpense>): PeriodicExpense => ({
  id: 1, name: "x", amount: 1200, everyMonths: 12, nextDue: "2027-10", savedSoFar: 0, autoKey: null, ...p,
});

describe("set-aside math", () => {
  it("counts the due month and never goes below 1", () => {
    expect(monthsUntil("2026-11-06", "2026-11")).toBe(1);
    expect(monthsUntil("2026-11-06", "2027-10")).toBe(12);
    expect(monthsUntil("2026-11-06", "2026-05")).toBe(1);
  });
  it("divides what is left by the months left", () => {
    expect(monthlySetAside(item({}), "2026-11-06")).toBe(100);
    expect(monthlySetAside(item({ savedSoFar: 600 }), "2026-11-06")).toBe(50);
    expect(monthlySetAside(item({ savedSoFar: 5000 }), "2026-11-06")).toBe(0);
    expect(totalSetAside([item({}), item({ amount: 300, nextDue: "2026-12" })], "2026-11-06")).toBe(250);
  });
  it("rolls the next due month forward past today", () => {
    expect(nextDueFrom("2025-03-10", 12, "2026-11-06")).toBe("2027-03");
    expect(nextDueFrom("2026-09-01", 2, "2026-11-06")).toBe("2026-11");
  });
});

describe("detectPeriodic", () => {
  const today = "2026-11-06";
  it("finds keyword bills and yearly series, skipping known keys", () => {
    const charges = [
      { description: "ביטוח חובה הפניקס", amount: 1800, date: "2026-03-02", category: null },
      { description: "ארנונה עיריית ת\"א", amount: 900, date: "2026-07-01", category: null },
      { description: "ארנונה עיריית ת\"א", amount: 900, date: "2026-09-01", category: null },
      { description: "ציוד לימוד", amount: 400, date: "2026-08-20", category: null },
    ];
    charges.push({ description: "Costco", amount: 222, date: "2025-01-15", category: null }, { description: "Costco", amount: 222, date: "2026-01-15", category: null });
    const s = detectPeriodic(charges, [{ merchant: "Costco", expectedAmount: 222, lastDate: "2026-01-15" }], today, new Set(["kw:camp"]));
    const by = Object.fromEntries(s.map((x) => [x.autoKey, x]));
    expect(by["kw:car-insurance"]).toMatchObject({ amount: 1800, everyMonths: 12, nextDue: "2027-03" });
    expect(by["kw:arnona"]).toMatchObject({ amount: 900, everyMonths: 2, nextDue: "2026-11" });
    expect(by["kw:school"]).toMatchObject({ nextDue: "2027-08" });
    expect(by["yearly:Costco"]).toMatchObject({ amount: 220, nextDue: "2027-01" });
    expect(detectPeriodic(charges, [], today, new Set(["kw:arnona"])).some((x) => x.autoKey === "kw:arnona")).toBe(false);
  });
  it("puts the two-monthly utilities aside too", () => {
    const charges = ["2026-05-10", "2026-07-10", "2026-09-10"].flatMap((date) => [
      { description: "חברת החשמל לישראל", amount: 640, date, category: null },
      { description: "מי אביבים 2010", amount: 210, date, category: null },
    ]);
    const by = Object.fromEntries(detectPeriodic(charges, [], today, new Set()).map((x) => [x.autoKey, x]));
    expect(by["kw:electricity"]).toMatchObject({ amount: 640, everyMonths: 2 });
    expect(by["kw:water"]).toMatchObject({ amount: 210, everyMonths: 2 });
  });
  it("ignores monthly bills and detects a holiday spike", () => {
    const charges = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      return { description: "ועד בית", amount: 100, date: `2026-${m}-01`, category: m === "09" ? "Groceries" : "Groceries" };
    }).map((c) => ({ ...c, amount: c.date.startsWith("2026-09") ? 3000 : 2000 }));
    const s = detectPeriodic(charges, [], today, new Set());
    expect(s.some((x) => x.autoKey === "kw:vaad")).toBe(false);
    expect(s.find((x) => x.autoKey === "holidays-tishrei")).toMatchObject({ amount: 1000, nextDue: "2027-09" });
  });
});

it("does not turn an unsupported yearly classification or bookstore visit into an annual bill", () => {
  const charges = [{description:"Restaurant",amount:200,date:"2026-10-01",category:null},{description:"סטימצקי",amount:100,date:"2026-08-01",category:null}];
  expect(detectPeriodic(charges,[{merchant:"Restaurant",expectedAmount:200,lastDate:"2026-10-01"}],"2026-11-07",new Set())).toEqual([]);
});
