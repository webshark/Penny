import { describe, expect, it } from "vitest";
import { toOfx } from "@/lib/ofx";

describe("toOfx", () => {
  const out = toOfx([
    { number: "12-345", kind: "bank", currency: "ILS", bank: "leumi", txns: [{ id: 1, date: "2026-11-01", amount: 15000, name: "משכורת" }, { id: 2, date: "2026-11-05", amount: -5000, name: "שכר דירה & ועד" }] },
    { number: "4580", kind: "card", currency: "ILS", txns: [{ id: 3, date: "2026-11-03", amount: -120.5, name: "וולט תל אביב - הזמנה ארוכה מאוד מאוד מאוד", memo: "ארוחה" }] },
  ], "2026-11-21");

  it("writes one statement per account, banks and cards in their own sets", () => {
    expect(out.startsWith('<?xml version="1.0"')).toBe(true);
    expect(out).toContain("<BANKACCTFROM><BANKID>leumi</BANKID><ACCTID>12-345</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE>");
    expect(out).toContain("<CCACCTFROM><ACCTID>4580</ACCTID></CCACCTFROM>");
    expect(out.match(/<BANKMSGSRSV1>/g)).toHaveLength(1);
    expect(out).toContain("<DTSTART>20261101</DTSTART><DTEND>20261105</DTEND>");
  });

  it("signs amounts, escapes text and keeps long names whole in the memo", () => {
    expect(out).toContain("<TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261101</DTPOSTED><TRNAMT>15000.00</TRNAMT><FITID>penny-1</FITID>");
    expect(out).toContain("<NAME>שכר דירה &amp; ועד</NAME>");
    expect(out).toContain("<TRNAMT>-120.50</TRNAMT>");
    expect(out).toContain("<MEMO>וולט תל אביב - הזמנה ארוכה מאוד מאוד מאוד · ארוחה</MEMO>");
  });
});
