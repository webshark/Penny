import { describe, expect, it } from "vitest";
import {
  buildSheetDrafts,
  emptySheetDraft,
  findSheetHeader,
  guessSheetColumns,
  markSheetDuplicates,
  needsMapping,
  normalizeSheetRow,
  parseSheetDate,
  parseSheetPaste,
  SHEET_TEMPLATE_HEADER,
  sheetSummary,
  sheetTemplateCsv,
} from "@/lib/sheet-import";

const TODAY = "2024-03-10";

describe("parseSheetPaste", () => {
  it("reads a copied spreadsheet block (tabs) and drops blank rows", () => {
    expect(parseSheetPaste("תאריך\tתיאור\tסכום\n\n05/03/2024\tסופר\t84.90\n")).toEqual([
      ["תאריך", "תיאור", "סכום"],
      ["05/03/2024", "סופר", "84.90"],
    ]);
  });

  it("reads an HTML table copied from a browser", () => {
    const html = "<table><tr><th>תאריך</th><th>תיאור</th><th>סכום</th></tr><tr><td>05/03/2024</td><td>קפה</td><td>12</td></tr></table>";
    expect(parseSheetPaste(html)).toEqual([
      ["תאריך", "תיאור", "סכום"],
      ["05/03/2024", "קפה", "12"],
    ]);
  });
});

describe("findSheetHeader / guessSheetColumns", () => {
  it("maps the template's Hebrew header to every field", () => {
    const table = parseSheetPaste(sheetTemplateCsv());
    expect(findSheetHeader(table)).toBe(0);
    const map = guessSheetColumns(table[0]);
    expect(map).toMatchObject({ date: 0, description: 1, amount: 2, kind: 3, account: 4, category: 5, tags: 6, owner: 7, business: 8, memo: 9 });
    expect(needsMapping(map)).toBe(false);
  });

  it("maps an English header and returns -1 for a headerless list", () => {
    expect(guessSheetColumns(["Date", "Description", "Amount", "Category"])).toMatchObject({
      date: 0,
      description: 1,
      amount: 2,
      category: 3,
    });
    expect(findSheetHeader([["05/03/2024", "קפה", "12"]])).toBe(-1);
  });
});

describe("parseSheetDate", () => {
  it("reads the file formats, relative words and a missing year", () => {
    expect(parseSheetDate("05/03/2024", "dmy", TODAY)).toBe("2024-03-05");
    expect(parseSheetDate("2024-03-05", "dmy", TODAY)).toBe("2024-03-05");
    expect(parseSheetDate("היום", "dmy", TODAY)).toBe(TODAY);
    expect(parseSheetDate("yesterday", "dmy", TODAY)).toBe("2024-03-09");
    expect(parseSheetDate("5/3", "dmy", TODAY)).toBe("2024-03-05");
    expect(parseSheetDate("05.03.24", "dmy", TODAY)).toBe("2024-03-05");
    expect(parseSheetDate("03/05/2024", "mdy", TODAY)).toBe("2024-03-05");
    expect(parseSheetDate("31/02/2024", "dmy", TODAY)).toBeNull();
  });

  it("rolls a yearless date into last year when it would be in the future", () => {
    expect(parseSheetDate("25/12", "dmy", TODAY)).toBe("2023-12-25");
  });
});

describe("normalizeSheetRow", () => {
  it("turns a pasted row into a transaction with kind, tags and errors", () => {
    const row = normalizeSheetRow(
      emptySheetDraft({ date: "05/03/2024", description: "  סופר   השכונה ", amount: "₪84.90", account: "cash", category: "אוכל", tags: "משפחה, שבועי" }),
      { today: TODAY, defaultAccount: "cash" },
    );
    expect(row.errors).toEqual([]);
    expect(row.values).toMatchObject({
      date: "2024-03-05",
      description: "סופר השכונה",
      amount: 84.9,
      kind: "expense",
      account: "cash",
      category: "אוכל",
      tags: ["משפחה", "שבועי"],
    });
  });

  it("lets an explicit kind win and reads a negative amount as an expense", () => {
    expect(normalizeSheetRow(emptySheetDraft({ date: TODAY, description: "x", amount: "100", kind: "income", account: "cash" })).values.kind).toBe("income");
    expect(normalizeSheetRow(emptySheetDraft({ date: TODAY, description: "x", amount: "-100", account: "cash" })).values.kind).toBe("expense");
    expect(
      normalizeSheetRow(emptySheetDraft({ date: TODAY, description: "x", amount: "100", account: "cash" }), { positiveIsExpense: false }).values.kind,
    ).toBe("income");
  });

  it("reports every broken cell", () => {
    const { errors } = normalizeSheetRow(emptySheetDraft({ amount: "abc", business: "140" }));
    expect(errors.map((e) => e.field).sort()).toEqual(["account", "amount", "business", "date", "description"]);
  });

  it("rejects a business share out of range and keeps a valid one", () => {
    const base = { date: TODAY, description: "x", amount: "10", account: "cash" };
    expect(normalizeSheetRow(emptySheetDraft({ ...base, business: "140" })).errors).toContainEqual({ field: "business", code: "businessRange" });
    expect(normalizeSheetRow(emptySheetDraft({ ...base, business: "40" })).values.businessSharePct).toBe(40);
  });
});

describe("buildSheetDrafts", () => {
  it("keeps empty cells empty instead of guessing", () => {
    const table = [
      ["תאריך", "תיאור", "סכום"],
      ["05/03/2024", "קפה", "12"],
    ];
    const [draft] = buildSheetDrafts(table.slice(1), guessSheetColumns(table[0]));
    expect(draft).toMatchObject({ date: "05/03/2024", description: "קפה", amount: "12", category: "", account: "" });
  });
});

describe("sheetSummary", () => {
  it("totals expenses, income, the date range and each account", () => {
    const summary = sheetSummary([
      { account: "cash", date: "2024-03-05", kind: "expense", amount: 50 },
      { account: "cash", date: "2024-03-07", kind: "income", amount: 200 },
      { account: "leumi", date: "2024-03-01", kind: "expense", amount: 30 },
    ]);
    expect(summary).toMatchObject({ count: 3, expenses: 80, income: 200, net: 120, from: "2024-03-01", to: "2024-03-07" });
    expect(summary.byAccount).toEqual([
      { account: "cash", count: 2, net: 150 },
      { account: "leumi", count: 1, net: -30 },
    ]);
  });
});

describe("markSheetDuplicates", () => {
  const row = (date: string, description: string, amount: number, kind: "expense" | "income" = "expense") => ({
    account: "cash",
    date,
    description,
    amount,
    kind,
  });

  it("skips only as many rows as are already stored for the account", () => {
    const out = markSheetDuplicates([row("2024-03-05", "קפה", 12), row("2024-03-06", "קפה", 12), row("2024-03-07", "קפה", 12)], () => [
      { date: "2024-03-05", amount: -12 },
    ]);
    expect(out.map((d) => d.duplicate)).toEqual([true, false, false]);
  });

  it("flags a repeated row inside the paste without dropping it", () => {
    const out = markSheetDuplicates([row("2024-03-05", "קפה", 12), row("2024-03-05", "קפה", 12)], () => []);
    expect(out.map((d) => [d.duplicate, d.repeated])).toEqual([
      [false, false],
      [false, true],
    ]);
  });

  it("checks each account against its own stored rows", () => {
    const out = markSheetDuplicates(
      [
        { account: "cash", date: "2024-03-05", description: "א", amount: 10, kind: "expense" },
        { account: "leumi", date: "2024-03-05", description: "א", amount: 10, kind: "expense" },
      ],
      (account) => (account === "cash" ? [{ date: "2024-03-05", amount: -10 }] : []),
    );
    expect(out.map((d) => d.duplicate)).toEqual([true, false]);
  });
});

describe("template", () => {
  it("has a header line that maps back to the same columns", () => {
    expect(SHEET_TEMPLATE_HEADER).toHaveLength(10);
    const map = guessSheetColumns(SHEET_TEMPLATE_HEADER);
    expect(Object.values(map).every((v) => v != null)).toBe(true);
  });
});
