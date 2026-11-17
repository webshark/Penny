import { describe, expect, it } from "vitest";
import { maskKey, maskRequestBody, maskTitle, maskUrl, shapeOf, typesOnly } from "../scripts/leumi-discover-mask.mjs";

// Everything a capture must never contain. The output of the masker is read by other people.
const SECRETS = [
  "eyJhbGciOiJSUzI1NiJ9", "c0ffee00-1234-4abc-9def-0123456789ab", "123-456789", "12345678", "987654",
  "משכורת", "ACME", "Dana", "15234.75", "15234", "-420.5", "2026-11-03", "20261103", "0541234567", "Passw0rd", "hunter",
];
const leaks = (value: unknown) => SECRETS.filter((s) => JSON.stringify(value).includes(s));

describe("leumi discovery masking", () => {
  it("keeps field names and drops every value in a response", () => {
    const shape = shapeOf({
      accountsItems: [
        { maskedNumber: "123-456789", balanceIncludingToday: 15234.75, ownerName: "Dana ACME", isBusiness: true },
        { maskedNumber: "987654/12", balanceIncludingToday: -420.5, note: null },
      ],
      historyILSTrxItems: [{ date: "2026-11-03", description: "משכורת ACME בע״מ", amount: 15234.75, phone: "0541234567" }],
      byAccount: { "123-456789": { total: 15234 }, "משכורת": { total: 1 } },
    });
    expect(leaks(shape)).toEqual([]);
    const text = JSON.stringify(shape);
    for (const key of ["accountsItems", "maskedNumber", "balanceIncludingToday", "historyILSTrxItems", "note", "isBusiness"]) expect(text).toContain(key);
    // Both array items are merged, so a field only one of them has is still listed.
    expect(shape.accountsItems.item).toHaveProperty("ownerName");
    expect(shape.accountsItems.item).toHaveProperty("note");
    expect(shape.historyILSTrxItems.item.date).toBe("string:9999-99-99");
  });

  it("drops tokens, tracking codes and account numbers from a URL", () => {
    const url = maskUrl(
      "https://hb2.bankleumi.co.il/staticcontent/gate-keeper/he/acc/12345678/x?trackingCode=c0ffee00-1234-4abc-9def-0123456789ab&sysNum=23&fromDate=20261103&comboMethod=true#ts=eyJhbGciOiJSUzI1NiJ9.abc.def",
    );
    expect(leaks(url)).toEqual([]);
    expect(url.host).toBe("hb2.bankleumi.co.il");
    expect(url.path).toBe("/staticcontent/gate-keeper/he/acc/99999999/x");
    // A digits-only date keeps its layout (the scraper must send the same one) but none of its digits.
    expect(url.query).toMatchObject({ sysNum: "23", comboMethod: "true", fromDate: "date:YYYYMMDD" });
    expect(maskUrl("https://x.co.il/a?d=03112026").query).toEqual({ d: "date:DDMMYYYY" });
    expect(url.hash).toEqual({ key: "ts", dropped: true });
  });

  it("keeps a screen route in the hash but not its values", () => {
    const url = maskUrl("https://hb2.bankleumi.co.il/eBanking/SO/SPA.aspx#/ts/BusinessAccountTrx?WidgetPar=12345678");
    expect(leaks(url)).toEqual([]);
    expect(url.hash).toEqual({ route: "/ts/BusinessAccountTrx", queryKeys: ["WidgetPar"] });
  });

  it("records only types for a request body, so not even a password's pattern is kept", () => {
    const body = typesOnly({ user: "Dana", password: "Passw0rd!hunter", remember: true, ids: [12345678] });
    expect(leaks(body)).toEqual([]);
    expect(body).toEqual({ user: "string", password: "string", remember: "boolean", ids: { "[]": 1, item: "number" } });
  });

  it("keeps a request's switches and date layout outside sign-in, and only names during it", () => {
    const json = JSON.stringify({ accountId: "12345678", fromDate: "20261103", periodType: 1, includeToday: true, text: "ACME" });
    const sent = maskRequestBody(json, false);
    expect(leaks(sent)).toEqual([]);
    expect(sent).toEqual({ accountId: "string:99999999", fromDate: "string:date:YYYYMMDD", periodType: "number:1", includeToday: "boolean:true", text: "string:AAAA" });
    expect(maskRequestBody(json, true)).toEqual({ accountId: "string", fromDate: "string", periodType: "number", includeToday: "boolean", text: "string" });

    const form = "user=Dana&password=Passw0rd%21hunter&period=3";
    expect(maskRequestBody(form, true)).toEqual({ form: { user: "string", password: "string", period: "string" } });
    expect(leaks(maskRequestBody(form, false))).toEqual([]);
    expect(maskRequestBody(form, false)).toMatchObject({ form: { period: "3" } });
    expect(maskRequestBody("Passw0rd", true)).toBe("not json");
  });

  it("masks keys that are data and digits in titles", () => {
    expect(maskKey("historyILSTrxItems")).toBe("historyILSTrxItems");
    expect(maskKey("123-456789")).toBe("~999-999999");
    expect(maskTitle("לאומי עסקים - חשבון 12345678")).toBe("לאומי עסקים - חשבון 99999999");
  });
});
