import { describe, expect, it } from "vitest";
import { accountNumberOf, apiHeaders, byDatesUrl, describeHeaders, mapRow, missingFrom, monthChunks, toIso, ymd } from "@/server/scrapers/leumi-digital";
import { redactScraperError } from "@/server/lib/redact";

const BASE = "https://hb2.bankleumi.co.il/v1/corp/ui-corp-transactions/";
const DEFAULT = `${BASE}transactionsdefault/digitalfront/accounts/2/transactions/default?operationMode=1`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("leumi new site: addresses and headers", () => {
  it("turns the site's latest-transactions address into the date-range one for the same account", () => {
    expect(byDatesUrl(DEFAULT, "20260801", "20260831")).toBe(
      `${BASE}transactionsbydates/digitalfront/accounts/2/transactions/bydates?periodType=1&fromDate=20260801&toDate=20260831`,
    );
    expect(byDatesUrl(`${BASE}somethingelse/digitalfront/accounts/2/list`, "20260801", "20260831")).toBeNull();
  });

  const sent = {
    authorization: "Bearer abc",
    cookie: "session=1",
    "user-agent": "x",
    accept: "application/json",
    "x-session-id": "s1",
    "x-message-id": "0b1c2d3e-4f50-4617-8899-aabbccddeeff",
    "x-transaction-id": "plain-id",
  };
  const to = byDatesUrl(DEFAULT, "20260801", "20260831")!;

  it("forwards only the site's own headers, and renews per-request ids that are UUIDs", () => {
    const h = apiHeaders({ ...sent, route_app_name: "digitalfront" }, DEFAULT, to, "adapted");
    expect(Object.keys(h).sort()).toEqual(["accept", "authorization", "route_app_name", "x-message-id", "x-session-id", "x-transaction-id"]);
    expect(h.route_app_name).toBe("digitalfront"); // the same in both addresses, so it stays
    expect(h["x-message-id"]).toMatch(UUID);
    expect(h["x-message-id"]).not.toBe(sent["x-message-id"]);
    expect(h["x-transaction-id"]).toBe("plain-id"); // not a UUID: kept
    expect(apiHeaders(sent, DEFAULT, to, "verbatim")["x-message-id"]).toBe(sent["x-message-id"]);
  });

  it("makes a header that carries the route name follow the new address, and nothing else", () => {
    const h = apiHeaders({ ...sent, route_app_name: "transactionsdefault", "x-mode": "default", "x-channel-id": "2" }, DEFAULT, to, "adapted");
    expect(h.route_app_name).toBe("transactionsbydates");
    expect(h["x-mode"]).toBe("default"); // equal to another part of the address by chance: left alone
    expect(h["x-channel-id"]).toBe("2"); // equal to the account number by chance: left alone
    expect(apiHeaders({ ...sent, route_app_name: "transactionsdefault" }, DEFAULT, to, "verbatim").route_app_name).toBe("transactionsdefault");
    // The log line names headers and kinds, never values.
    const line = describeHeaders({ ...sent, route_app_name: "transactionsdefault" }, DEFAULT);
    expect(line).toContain("carrying the route name: route_app_name");
    expect(line).toContain("x-message-id uuid");
    expect(line).not.toMatch(/abc|0b1c2d3e|s1\b/);
  });

  it("words its notes so Penny's error redaction leaves them readable", () => {
    const notes = [
      "site router ready, site calls seen 3",
      "opened transactions page by router",
      "accounts 2",
      describeHeaders({ ...sent, route_app_name: "transactionsdefault" }, DEFAULT),
      "date-range call (adapted headers) answered 400 steps.oauth.Failed",
      "account 1: 87 rows, 2026-08-17 to 2026-11-17, 6 calls (2 cut short and split), adapted headers, site's own list 40 rows of which 0 were missing from the date range and added",
    ];
    const message = `Leumi new site: the bank refused the date-range request [${notes.join("; ")}]`;
    expect(redactScraperError(message, ["fake-user", "fake-pass"])).toBe(message);
  });
});

describe("leumi new site: dates and rows", () => {
  it("cuts a range at month ends, whole days, no overlap", () => {
    const chunks = monthChunks(new Date(2026, 7, 17, 15, 30), new Date(2026, 10, 17, 9, 0)).map(([a, b]) => `${ymd(a)}-${ymd(b)}`);
    expect(chunks).toEqual(["20260817-20260831", "20260901-20260930", "20261001-20261031", "20261101-20261117"]);
    expect(monthChunks(new Date(2026, 10, 17), new Date(2026, 10, 17)).map(([a, b]) => `${ymd(a)}-${ymd(b)}`)).toEqual(["20261117-20261117"]);
  });

  it("reads the bank's local date-time the way the library's scrapers store dates", () => {
    expect(toIso("2026-11-03 00:00:00")).toBe(new Date(2026, 10, 3).toISOString());
    expect(toIso("2026-11-03 14:05:09")).toBe(new Date(2026, 10, 3, 14, 5, 9).toISOString());
    expect(toIso("03/11/2026")).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });

  it("maps a row, keeping the sign of the amount and the statement's reference number", () => {
    const txn = mapRow({ date: "2026-11-03 00:00:00", description: " העברה ", extendedDescription: "פרטים", amount: -1234.5, referenceNumber: "778899" });
    expect(txn).toEqual({
      type: "normal",
      identifier: "778899",
      date: new Date(2026, 10, 3).toISOString(),
      processedDate: new Date(2026, 10, 3).toISOString(),
      originalAmount: -1234.5,
      originalCurrency: "ILS",
      chargedAmount: -1234.5,
      description: "העברה",
      memo: "פרטים",
      status: "completed",
    });
    expect(mapRow({ date: "2026-11-03 00:00:00", description: "x" })).toBeNull();
    expect(mapRow({ amount: 5, description: "x" })).toBeNull();
  });

  it("finds rows of the site's own list that a date-range result lacks", () => {
    const a = { transactionID: "1", date: "2026-11-17 00:00:00", amount: 5 };
    const b = { transactionID: "2", date: "2026-11-16 00:00:00", amount: 6 };
    const old = { transactionID: "3", date: "2026-08-01 00:00:00", amount: 7 };
    expect(missingFrom([b], [a, b, old], "2026-08-17")).toEqual([a]);
    // Without the bank's id, the reference number, date, amount and text identify a row.
    const plain = { referenceNumber: "9", date: "2026-11-17 00:00:00", amount: 5, description: "x" };
    expect(missingFrom([{ ...plain }], [plain, { ...plain, amount: 6 }], "2026-08-17")).toEqual([{ ...plain, amount: 6 }]);
  });

  it("writes the account number like the library's Leumi scraper", () => {
    expect(accountNumberOf("123-45678/90")).toBe("123-45678_90");
  });
});
