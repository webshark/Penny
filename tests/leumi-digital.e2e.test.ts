// Runs the real Leumi scraper class (the library's login included) in a real browser against a fake bank on
// this machine. It needs Chromium and takes a while, so it only runs when asked for:
//   LEUMI_E2E=1 npx vitest run tests/leumi-digital.e2e.test.ts
import puppeteer from "puppeteer";
import { CompanyTypes } from "israeli-bank-scrapers";
import { afterEach, describe, expect, it } from "vitest";
import { LeumiDigitalScraper } from "@/server/scrapers/leumi-digital-scraper";
import { waitForPostLogin, watchSignIn } from "@/server/scrapers/leumi-digital";
import { FAKE_ACCOUNTS, fakeRows, startFakeLeumi, type FakeLeumiOptions } from "./fixtures/fake-leumi";

const DAYS = 75;
const startDate = new Date();
startDate.setDate(startDate.getDate() - DAYS);
const startDay = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
const expectedRows = (accountIndex: number) => fakeRows(accountIndex).filter((r) => r.date.slice(0, 10) >= startDay);

let fake: Awaited<ReturnType<typeof startFakeLeumi>> | undefined;
afterEach(async () => { await fake?.close(); fake = undefined; });

async function scrape(options: FakeLeumiOptions) {
  fake = await startFakeLeumi(options);
  const origin = fake.origin;
  // Only the two addresses differ from production: the library's login steps and everything after run as they are.
  class FakeBankScraper extends LeumiDigitalScraper {
    getLoginOptions(credentials: { username: string; password: string }) {
      const real = super.getLoginOptions(credentials);
      return { ...real, loginUrl: `${origin}/he`, checkReadiness: async () => { await this.page.goto(`${origin}/authenticate/logon`); } };
    }
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
});
