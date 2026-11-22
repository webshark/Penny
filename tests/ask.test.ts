import { describe, expect, it } from "vitest";
import { looksLikeQuestion, parseQuestion, periodLabel } from "@/lib/ask";

const today = new Date(2026, 10, 6); // 6 Nov 2026, a Friday
const cats = [
  { id: 1, names: ["Food", "אוכל", "Food"] },
  { id: 2, names: ["Restaurants", "מסעדות", "Restaurants"] },
  { id: 3, names: ["Groceries", "מצרכים", "Groceries"] },
  { id: 4, names: ["Subscriptions", "מנויים", "Subscriptions"] },
];
const descs = ["WOLT TEL AVIV", "וולט שליחויות", "שופרסל דיל", "NETFLIX.COM"];
const ask = (q: string) => parseQuestion(q, today, cats, descs);

describe("parseQuestion", () => {
  const cases: [string, Partial<ReturnType<typeof ask>>, { from: string; to: string }][] = [
    ["כמה הוצאתי על אוכל בחודש שעבר", { intent: "spent", categoryId: 1 }, { from: "2026-10-01", to: "2026-10-31" }],
    ["כמה שילמתי לוולט השנה", { intent: "spent", merchant: "וולט" }, { from: "2026-01-01", to: "2026-11-06" }],
    ["מה ההוצאה הכי גדולה החודש", { intent: "biggest" }, { from: "2026-11-01", to: "2026-11-06" }],
    ["כמה נכנס לי ברבעון הזה", { intent: "income" }, { from: "2026-10-01", to: "2026-11-06" }],
    ["כמה נשאר לי עד המשכורת", { intent: "untilPayday" }, { from: "2026-11-01", to: "2026-11-06" }],
    ["מה המנויים שלי", { intent: "subscriptions" }, { from: "2026-11-01", to: "2026-11-06" }],
    ["כמה אני חוסך בחודש", { intent: "savings" }, { from: "2026-11-01", to: "2026-11-06" }],
    ["כמה הוצאתי במסעדות היום", { intent: "spent", categoryId: 2 }, { from: "2026-11-06", to: "2026-11-06" }],
    ["כמה הוצאתי השבוע", { intent: "spent" }, { from: "2026-11-01", to: "2026-11-06" }],
    ["כמה הוצאתי על מצרכים שנה שעברה", { intent: "spent", categoryId: 3 }, { from: "2025-01-01", to: "2025-12-31" }],
    ["כמה הוצאתי באוגוסט", { intent: "spent" }, { from: "2026-08-01", to: "2026-08-31" }],
    ["כמה הוצאתי בדצמבר", { intent: "spent" }, { from: "2025-12-01", to: "2025-12-31" }],
    ["כמה הוצאתי על אוכל ב-3 חודשים האחרונים", { intent: "spent", categoryId: 1 }, { from: "2026-09-01", to: "2026-11-06" }],
    ["How much did I spend on restaurants last month?", { intent: "spent", categoryId: 2 }, { from: "2026-10-01", to: "2026-10-31" }],
    ["how much did I pay wolt this year", { intent: "spent", merchant: "wolt" }, { from: "2026-01-01", to: "2026-11-06" }],
    ["What was my biggest expense in October?", { intent: "biggest" }, { from: "2026-10-01", to: "2026-10-31" }],
    ["How much income this quarter", { intent: "income" }, { from: "2026-10-01", to: "2026-11-06" }],
    ["netflix last year", { intent: "spent", merchant: "netflix" }, { from: "2025-01-01", to: "2025-12-31" }],
    ["מה מזג האוויר", { intent: null }, { from: "2026-11-01", to: "2026-11-06" }],
  ];
  it.each(cases)("%s", (q, want, period) => {
    const got = ask(q);
    expect(got).toMatchObject(want);
    expect({ from: got.period.from, to: got.period.to }).toEqual(period);
  });
});

describe("month start day", () => {
  // Months start on the 10th, and 6 Nov is still the October household month.
  const askShifted = (q: string) => parseQuestion(q, today, cats, descs, 10).period;

  it("moves each named period to the household month", () => {
    expect(askShifted("כמה הוצאתי בחודש שעבר")).toMatchObject({ from: "2026-09-10", to: "2026-10-09" });
    expect(askShifted("כמה הוצאתי החודש")).toMatchObject({ from: "2026-10-10", to: "2026-11-06" });
    expect(askShifted("כמה הוצאתי בספטמבר")).toMatchObject({ from: "2026-09-10", to: "2026-10-09" });
    expect(askShifted("כמה הוצאתי השנה")).toMatchObject({ from: "2026-01-10", to: "2026-11-06" });
  });

  it("keeps day and week questions exact", () => {
    expect(askShifted("כמה הוצאתי היום")).toMatchObject({ from: "2026-11-06", to: "2026-11-06" });
  });
});

describe("periodLabel", () => {
  it("names the dates", () => {
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-31" }, "he")).toBe("בין 1 ל-31 באוקטובר");
    expect(periodLabel({ from: "2025-12-01", to: "2026-01-31" }, "he")).toBe("בין 1 בדצמבר 2025 ל-31 בינואר 2026");
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-31" }, "en")).toBe("between Oct 1 and Oct 31");
  });
});

describe("looksLikeQuestion", () => {
  it("spots questions only", () => {
    expect(looksLikeQuestion("כמה הוצאתי")).toBe(true);
    expect(looksLikeQuestion("wolt?")).toBe(true);
    expect(looksLikeQuestion("הגדרות")).toBe(false);
  });
});
