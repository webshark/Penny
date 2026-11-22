import { describe, expect, it } from "vitest";
import { dictionaryCategory } from "@/lib/merchant-dictionary";

describe("dictionaryCategory", () => {
  it.each([
    ["שופרסל דיל ת\"א", "Groceries"],
    ["SHUFERSAL ONLINE", "Groceries"],
    ["רמי לוי תקשורת", "Mobile Phone"],
    ["רמי לוי שיווק השקמה", "Groceries"],
    ["פזגז בע\"מ", "Gas"],
    ["פז ילו רמת גן", "Fuel"],
    ["חברת החשמל לישראל", "Electricity"],
    ["מי אביבים 2010", "Water"],
    ["עיריית תל אביב-יפו", "Arnona"],
    ["WOLT", "Food Delivery"],
    ["NETFLIX.COM", "Streaming"],
    ["ביטוח לאומי", "National Insurance"],
    ["ע\"ר לתת", "Donations"],
    ["‏ארומה תל אביב‎", "Coffee & Cafes"],
  ])("%s → %s", (d, cat) => expect(dictionaryCategory(d, "expense")).toBe(cat));

  it("leaves ambiguous and unknown merchants alone", () => {
    for (const d of ["סופר-פארם", "המשביר לצרכן", "העברה לחשבון", "מקסים רסטורנט", "דוד כהן", "יסמין פרחים", "פזורה"]) expect(dictionaryCategory(d, "expense")).toBeNull();
  });

  it("reads income separately", () => {
    expect(dictionaryCategory("משכורת חברת אלפא", "income")).toBe("Salary");
    expect(dictionaryCategory("ביטוח לאומי קצבת ילדים", "income")).toBe("Benefits & Allowances");
    expect(dictionaryCategory("שופרסל", "income")).toBeNull();
  });
});
