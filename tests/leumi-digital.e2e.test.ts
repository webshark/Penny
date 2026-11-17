// Runs the real Leumi scraper class (the library's login included) in a real browser against a fake bank on
// this machine. It needs Chromium and takes a while, so it only runs when asked for:
//   LEUMI_E2E=1 npx vitest run tests/leumi-digital.e2e.test.ts
import puppeteer from "puppeteer";
import { CompanyTypes } from "israeli-bank-scrapers";
import { afterEach, describe, expect, it } from "vitest";
import { LeumiDigitalScraper } from "@/server/scrapers/leumi-digital-scraper";
import { waitForPostLogin, watchSignIn } from "@/server/scrapers/leumi-digital";
import { FAKE_ACCOUNTS, FAKE_FX, fakeRows, startFakeLeumi, type FakeLeumiOptions } from "./fixtures/fake-leumi";
import type { DailyRates } from "@/lib/fx-markup";

const RATES: DailyRates = { USD: [{ date: "2000-01-03", close: 3.5 }], EUR: [{ date: "2000-01-03", close: 4 }] };

const DAYS = 75;
const startDate = new Date();
startDate.setDate(startDate.getDate() - DAYS);
const startDay = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
const expectedRows = (accountIndex: number) => fakeRows(accountIndex).filter((r) => r.date.slice(0, 10) >= startDay);

let fake: Awaited<ReturnType<typeof startFakeLeumi>> | undefined;
afterEach(async () => { await fake?.close(); fake = undefined; });

async function scrape(options: FakeLeumiOptions, rates: DailyRates = RATES) {
  fake = await startFakeLeumi(options);
  const origin = fake.origin;
  // Only the two addresses differ from production: the library's login steps and everything after run as they are.
  class FakeBankScraper extends LeumiDigitalScraper {
    getLoginOptions(credentials: { username: string; password: string }) {
      const real = super.getLoginOptions(credentials);
      return { ...real, loginUrl: `${origin}/he`, checkReadiness: async () => { await this.page.goto(`${origin}/authenticate/logon`); } };
    }
    protected async exchangeRates() { return rates; } // never Yahoo from a test
  }
  const logs: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  try {
    const scraper = new FakeBankScraper({ companyId: CompanyTypes.leumi, startDate, showBrowser: false, verbose: false, timeout: 60_000 });
    const result = await scraper.scrape({ username: "fake-user", password: "fake-pass" });
    return { result, logs, refused: fake.refused };
  } finally {
    console.log = log;
  }
}

describe.skipIf(process.env.LEUMI_E2E !== "1")("leumi new site, end to end against a fake bank", () => {
  it("fetches every account's full history when ids must be new and a month is cut short", async () => {
    const { result, logs } = await scrape({ routeHeader: "constant", messageIds: "unique" });
    expect(result.errorMessage).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.accounts?.map((a) => a.accountNumber)).toEqual(["900-11111_22", "900-333333_44"]);
    expect(result.accounts?.map((a) => a.balance)).toEqual(FAKE_ACCOUNTS.map((a) => a.balanceIncludingToday));
    for (const [i, account] of (result.accounts ?? []).entries()) {
      const want = expectedRows(i + 1);
      expect(account.txns).toHaveLength(want.length);
      // Every row exactly once, although a month of account 1 (about 90 rows) arrives 40 at a time.
      expect(account.txns.map((t) => t.identifier).sort()).toEqual(want.map((r) => r.referenceNumber).sort());
      expect(new Set(account.txns.map((t) => t.description)).size).toBe(want.length);
    }
    const first = expectedRows(1)[0];
    expect(result.accounts?.[0].txns.find((t) => t.identifier === first.referenceNumber)).toMatchObject({ originalAmount: first.amount, chargedAmount: first.amount, status: "completed", originalCurrency: "ILS" });
    const line = logs.find((l) => l.startsWith("[leumi-digital]")) ?? "";
    expect(line).toContain("adapted headers");
    expect(line).toContain("site router ready");
    expect(line).toContain("opened transactions page by router");
    expect(line).not.toMatch(/fake-token|fake-pass|900-1/); // the log names no token, password or account number
  }, 120_000);

  it("follows a header that must name the address being called", async () => {
    const { result } = await scrape({ routeHeader: "perRoute", messageIds: "unique" });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.txns.length)).toEqual([expectedRows(1).length, expectedRows(2).length]);
  }, 120_000);

  it("falls back to repeating the site's headers when renewed ids are refused", async () => {
    const { result, logs, refused } = await scrape({ routeHeader: "constant", messageIds: "repeat" });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.txns.length)).toEqual([expectedRows(1).length, expectedRows(2).length]);
    expect(refused).toHaveLength(1); // one refused attempt, then the working form is kept
    expect(logs.join("\n")).toContain("verbatim headers");
  }, 120_000);

  it("fails, saving nothing, when a second account answers with the first one's data", async () => {
    const { result } = await scrape({ indexSelects: false });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/returned the same account/);
    expect(result.accounts ?? []).toHaveLength(0);
  }, 120_000);

  it("still fetches an account the site's page would not open, once the bank shows it is a different one", async () => {
    const { result, logs } = await scrape({ pageIgnoresAccount: true });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.txns.length)).toEqual([expectedRows(1).length, expectedRows(2).length]);
    expect(logs.join("\n")).toContain("account 2: using its address built from another account's");
  }, 180_000);

  it("adds today's rows from the site's own list when a date range leaves them out", async () => {
    const { result, logs } = await scrape({ rangeSkipsToday: true });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.txns.length)).toEqual([expectedRows(1).length, expectedRows(2).length]);
    expect(logs.join("\n")).toMatch(/account 1: .* of which 3 were missing from the date range and added/);
  }, 120_000);

  it("fails, saving nothing, when every answer claims there are more rows", async () => {
    const { result } = await scrape({ flagAlways: true });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/a single day is marked as having more transactions than the \d+ returned/);
  }, 120_000);

  it("says which sign-in requests went out when the page never leaves the form", async () => {
    fake = await startFakeLeumi({ signInWorks: false });
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const signIn = new Map<string, number>();
      watchSignIn(page, signIn);
      await page.goto(`${fake.origin}/authenticate/logon`);
      await page.type('input[placeholder="שם משתמש"]', "fake-user");
      await page.type('input[placeholder="סיסמה"]', "fake-pass");
      await page.click('button[type="submit"]');
      await expect(waitForPostLogin(page, signIn, 2500)).rejects.toThrow(/sign-in did not reach an account page \[requests: login 403, authenticate not sent, sso not sent; page \/authenticate\/logon; .*form still shown: yes\]/);
    } finally {
      await browser.close();
    }
  }, 60_000);
  it("adds every foreign account, of every client, in its currency with shekel amounts, after the shekel ones", async () => {
    // siteSendsByDates: as on the real site, switching foreign accounts sends a date-range request.
    const { result, logs } = await scrape({ foreign: true, siteSendsByDates: true });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.accountNumber)).toEqual(["900-11111_22", "900-333333_44", "900-555555_01 USD", "900-555555_01 EUR", "900-777777_02 USD"]);
    expect(result.accounts?.slice(2).map((a) => a.balance)).toEqual(FAKE_FX.map((a) => a.balanceIncludingTodayILS));
    for (const [n, fx] of FAKE_FX.entries()) {
      const rate = fx.currencyName === "אירו" ? 4 : 3.5;
      const want = expectedRows(fx.accountIndex);
      const txns = result.accounts![n + 2].txns;
      expect(txns.map((t) => t.identifier).sort()).toEqual(want.map((r) => r.referenceNumber).sort());
      const first = txns.find((t) => t.identifier === want[0].referenceNumber)!;
      expect(first).toMatchObject({ originalAmount: want[0].amount, originalCurrency: rate === 4 ? "EUR" : "USD", chargedAmount: Math.round(want[0].amount * rate * 100) / 100, chargedCurrency: "ILS", memo: want[0].extendedDescription });
    }
    // The shekel accounts are untouched by the foreign part.
    expect(result.accounts?.[0].txns.every((t) => t.originalCurrency === "ILS" && t.chargedAmount === t.originalAmount)).toBe(true);
    const line = logs.find((l) => l.startsWith("[leumi-digital]")) ?? "";
    expect(line).toContain("foreign list 2: 3 001, 5 001");
    expect(line).toContain("by-client 3: 3 001 דולר, 4 049 אירו");
    expect(line).toContain("by-client 5: 5 001 דולר"); // asked by the scraper: the site only asked about the first client
    expect(line).toContain("foreign route foreigntransactions+default/bydates, taken from the site's latest request");
    expect(line).toContain("EUR account: ");
  }, 240_000);

  it("accepts foreign accounts that share an IBAN when their rows differ", async () => {
    const { result, logs } = await scrape({ foreign: true, fxSharedIban: true });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts).toHaveLength(5);
    expect(logs.join("\n")).toContain("accounts 3 and 4 share an account reference but no rows");
  }, 240_000);

  it("skips a foreign account that answers with another's rows, and keeps the rest", async () => {
    const { result, logs } = await scrape({ foreign: true, fxSharedIban: true, indexSelects: "foreign" });
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.accountNumber)).toEqual(["900-11111_22", "900-333333_44", "900-555555_01 USD"]);
    expect(logs.join("\n")).toContain("account 4: skipped, accounts 3 and 4 returned the same account");
  }, 240_000);

  it("keeps the shekel accounts when there is no exchange rate", async () => {
    const { result, logs } = await scrape({ foreign: true }, {});
    expect(result.errorMessage).toBeUndefined();
    expect(result.accounts?.map((a) => a.accountNumber)).toEqual(["900-11111_22", "900-333333_44"]);
    expect(logs.join("\n")).toMatch(/EUR account skipped: no EUR rate for \d+ of \d+ rows/);
  }, 240_000);
  it("keeps a foreign account with no rows, which the bank answers with 204, even at a built address", async () => {
    const { result, logs } = await scrape({ foreign: true, emptyAccount: 4, pageIgnoresAccount: true });
    expect(result.errorMessage).toBeUndefined();
    const eur = result.accounts?.find((a) => a.accountNumber === "900-555555_01 EUR");
    expect(eur).toMatchObject({ balance: 850.5, txns: [] });
    expect(result.accounts).toHaveLength(5);
    expect(logs.join("\n")).toContain("account 4: no rows in the window");
  }, 240_000);
});
