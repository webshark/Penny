import { describe, expect, it } from "vitest";
import { extractedToTable, parseExtractedRows } from "@/lib/text-import";
import { findSheetHeader, guessSheetColumns, parseSheetKind } from "@/lib/sheet-import";

describe("text import", () => {
  it("reads the JSON array out of a chatty reply and keeps only good rows", () => {
    const reply = 'Here you go:\n```json\n[{"date":"2026-11-03","description":"שופרסל","amount":-214.5},{"date":"2026-11-04","description":"משכורת","amount":"12,000","kind":"income"},{"date":"03/11","description":"bad date","amount":5},{"date":"2026-11-05","description":"","amount":9},{"date":"2026-11-06","description":"zero","amount":0}]\n```';
    expect(parseExtractedRows(reply)).toEqual([
      { date: "2026-11-03", description: "שופרסל", amount: 214.5, kind: "expense" },
      { date: "2026-11-04", description: "משכורת", amount: 12000, kind: "income" },
    ]);
  });
  it("returns nothing for a reply with no array", () => {
    expect(parseExtractedRows("I could not find any transactions.")).toEqual([]);
    expect(parseExtractedRows("[not json")).toEqual([]);
  });
  it("builds a table the sheet import recognises", () => {
    const table = extractedToTable([{ date: "2026-11-03", description: "שופרסל", amount: 214.5, kind: "expense" }]);
    expect(findSheetHeader(table)).toBe(0);
    const map = guessSheetColumns(table[0]);
    expect([map.date, map.description, map.amount, map.kind]).toEqual([0, 1, 2, 3]);
    expect(parseSheetKind(table[1][3])).toBe("expense");
  });
});
