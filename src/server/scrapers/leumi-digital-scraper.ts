import "server-only";

import LeumiScraper from "israeli-bank-scrapers/lib/scrapers/leumi/leumi.js";
import { LoginResults } from "israeli-bank-scrapers/lib/scrapers/base-scraper-with-browser.js";
import type { ScraperOptions } from "israeli-bank-scrapers";
import { DIGITAL_URL, fetchDigitalAccounts, waitForPostLogin, watchSignIn } from "./leumi-digital";

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
    const accounts = await fetchDigitalAccounts(this.page, this.options.startDate, notes);
    console.log(`[leumi-digital] ${notes.join("; ")}`);
    // The library types "normal" / "completed" as enums; the strings are the enums' values.
    return { success: true, accounts } as unknown as Awaited<ReturnType<LeumiScraper["fetchData"]>>;
  }
}

export const createLeumiScraper = (options: ScraperOptions) => new LeumiDigitalScraper(options);
