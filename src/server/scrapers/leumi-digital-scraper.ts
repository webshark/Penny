import "server-only";

import LeumiScraper from "israeli-bank-scrapers/lib/scrapers/leumi/leumi.js";
import { LoginResults } from "israeli-bank-scrapers/lib/scrapers/base-scraper-with-browser.js";
import type { ScraperOptions } from "israeli-bank-scrapers";
import { rateOn, type DailyRates } from "@/lib/fx-markup";
import { dailyRates } from "@/server/insights/fx-rates";
import { DIGITAL_URL, dayBefore, fetchDigitalAccounts, waitForPostLogin, watchSignIn, type DigitalResultAccount } from "./leumi-digital";

/**
 * The library's Leumi scraper, taught that a sign-in may land on the bank's new site. Its login is reused as
 * it is; a landing on the old site still runs the library's own code. See leumi-digital.ts for the new site.
 */
export class LeumiDigitalScraper extends LeumiScraper {
  private signIn = new Map<string, number>();

  getLoginOptions(credentials: { username: string; password: string }) {
    const base = super.getLoginOptions(credentials);
    watchSignIn(this.page, this.signIn);
    return {
      ...base,
      postAction: () => waitForPostLogin(this.page, this.signIn),
      possibleResults: {
        ...base.possibleResults,
        [LoginResults.Success]: [...(base.possibleResults[LoginResults.Success] ?? []), DIGITAL_URL],
      },
    };
  }

  async fetchData(): ReturnType<LeumiScraper["fetchData"]> {
    if (!DIGITAL_URL.test(this.page.url())) return super.fetchData();
    const notes: string[] = [];
    const accounts = await this.inShekels(await fetchDigitalAccounts(this.page, this.options.startDate, notes), notes);
    console.log(`[leumi-digital] ${notes.join("; ")}`);
    // The library types "normal" / "completed" as enums; the strings are the enums' values.
    return { success: true, accounts } as unknown as Awaited<ReturnType<LeumiScraper["fetchData"]>>;
  }

  /** Market closes in shekels per currency. A method so a test can give its own. */
  protected exchangeRates(currencies: string[]): Promise<DailyRates> {
    return dailyRates(currencies, new Date().toISOString().slice(0, 10));
  }

  /**
   * Penny's totals are in shekels, so a foreign row keeps its own amount as the original and gets a shekel
   * charged amount at the market close of the day before it: a close that is final, so it is the same on
   * every sync. The bank's own rate differs a little. An account with a day that has no rate is left out.
   */
  private async inShekels(accounts: DigitalResultAccount[], notes: string[]): Promise<DigitalResultAccount[]> {
    const currencies = [...new Set(accounts.flatMap((a) => a.txns.map((t) => t.originalCurrency)))].filter((c) => c !== "ILS");
    if (currencies.length === 0) return accounts;
    const rates = await this.exchangeRates(currencies);
    return accounts.flatMap((account) => {
      const currency = account.txns.find((t) => t.originalCurrency !== "ILS")?.originalCurrency;
      if (!currency) return [account];
      const txns = account.txns.map((t) => {
        const rate = rateOn(rates[currency] ?? [], dayBefore(t.date));
        return rate === null ? null : { ...t, chargedAmount: Math.round(t.originalAmount * rate * 100) / 100, chargedCurrency: "ILS" };
      });
      const missing = txns.filter((t) => t === null).length;
      if (missing > 0) {
        notes.push(`${currency} account skipped: no ${currency} rate for ${missing} of ${txns.length} rows`);
        return [];
      }
      notes.push(`${currency} account: ${txns.length} rows converted at the previous day's market close`);
      return [{ ...account, txns: txns as typeof account.txns }];
    });
  }
}

export const createLeumiScraper = (options: ScraperOptions) => new LeumiDigitalScraper(options);
