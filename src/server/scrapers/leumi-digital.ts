// Bank Leumi's new website ("digitalfront"), where business logins now land. israeli-bank-scrapers only knows
// the old site (its issue 1106), so after its login this takes over.
//
// Built from a masked capture of the site's own calls (scripts/leumi-discover.mjs). What that showed:
//   - the data API refuses a request that carries only the session cookie; it needs the headers the
//     site's own code sends (a session token and a dozen x-... ones), so this reuses them;
//   - the site opens an account with ?accountIndex=N and then asks for .../accounts/N/transactions/default;
//   - a date range is .../accounts/N/transactions/bydates?periodType=1&fromDate=YYYYMMDD&toDate=YYYYMMDD;
//   - foreign-currency accounts mirror this under ui-corp-transactions-fx (.../foreigntransactions/...), on their
//     own page. Its account list has one entry per client (both said USD in the capture); a client's accounts,
//     one per currency, with names, numbers and shekel balances, are in its foreignaccountsbyclient answer.
// Foreign accounts are fetched after the shekel ones and are best effort: one that fails is skipped and said so
// in the log, so it never costs the shekel rows. (A sync fetches the whole window again, so it is not lost.)
// The rule here is complete-or-fail: a range the site cuts short is split, and anything that cannot be
// fetched in full throws, so a sync never saves part of the history as if it were all of it.
import { randomUUID } from "node:crypto";
import type { HTTPRequest, HTTPResponse, Page } from "puppeteer";

export const DIGITAL_URL = /\/staticcontent\/digitalfront\//i;
const NIS_PAGE = "/nis-accounts/nis-transactions";
const FX_PAGE = "/foreign-accounts/foreign-transactions";
const INVALID_PASSWORD_MSG = "אחד או יותר מפרטי ההזדהות שמסרת שגויים. ניתן לנסות שוב"; // same text the library waits for
const SERVICE = /^ui-corp-transactions(-fx)?$/;
const TRX_API = /\/v1\/corp\/ui-corp-transactions(-fx)?\//;
// The site's own request for an account's rows: .../<service>/<list>default|bydates/<app>/accounts/N/<list>/default|bydates.
// Shekel: transactionsdefault + /transactions/default. Foreign: the same with "foreign" in front (the capture masked
// those route names, but their lengths fit). When the site switches accounts with a date filter on, it sends bydates.
const SITE_URL = /^(.*\/v1\/corp\/ui-corp-transactions(?:-fx)?\/)([a-z]+?)(?:default|bydates)(\/[^/]+\/accounts\/)(\d+)\/([a-z]+)\/(?:default|bydates)(?:\?.*)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Headers the site adds to its API calls. The browser adds cookies and the rest itself.
const FORWARD = /^(accept|authorization|route_app_name|x-[a-z0-9_-]+)$/;
const PER_REQUEST = new Set(["x-message-id", "x-transaction-id"]);

interface DigitalAccount {
  accountIndex?: number;
  maskedNumber?: string;
  balanceIncludingToday?: number;
  currencyCode?: string; // foreign list only, for the log
}
interface DigitalRow { transactionID?: string; date?: string; description?: string; extendedDescription?: string; extendedDescription1?: string; amount?: number; referenceNumber?: string }
interface DigitalRows { additionalTransactionsFlag?: boolean; iban?: string; currentAccountReference?: string; historyILSTrxItems?: DigitalRow[]; historyForeignTrxItems?: DigitalRow[] }
const rowsOf = (json: DigitalRows | undefined) => json?.historyILSTrxItems ?? json?.historyForeignTrxItems;
interface Txn {
  type: "normal";
  identifier?: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  /** Set once a foreign amount has been converted to shekels (leumi-digital-scraper.ts). */
  chargedCurrency?: string;
  description: string;
  memo: string;
  status: "completed";
}
export interface DigitalResultAccount { accountNumber: string; balance?: number; txns: Txn[] }

/**
 * A failure that says how far the run got. `notes` hold statuses, page paths and counts, never values, and
 * are worded to survive redactScraperError (no long digit runs, no name=value forms).
 */
const fail = (what: string, notes: string[]) => new Error(`Leumi new site: ${what} [${notes.join("; ")}]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const path = (url: string) => { try { return new URL(url).pathname; } catch { return "?"; } };

async function until(ready: () => boolean, timeoutMs: number): Promise<boolean> {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(200)) if (ready()) return true;
  return ready();
}

/** An address the site used for an account's rows -> the date-range address for that account. */
export function byDatesUrl(siteUrl: string, from: string, to: string): string | null {
  const m = SITE_URL.exec(siteUrl);
  return m ? `${m[1]}${m[2]}bydates${m[3]}${m[4]}/${m[5]}/bydates?periodType=1&fromDate=${from}&toDate=${to}` : null;
}

// Where the route name sits in an address: /v1/corp/ui-corp-transactions[-fx]/<route name>/...
const routeName = (url: string) => { const s = path(url).split("/"); const i = s.findIndex((x) => SERVICE.test(x)); return i < 0 ? "" : s[i + 1] ?? ""; };

/**
 * Headers for our own call, from the ones the site sent to `fromUrl`.
 * "verbatim" repeats them. "adapted" does what the site's code presumably does for another address: a header
 * that carries the route name follows the new address, and per-request ids that are UUIDs are renewed.
 */
export function apiHeaders(sent: Record<string, string>, fromUrl: string, toUrl: string, mode: "adapted" | "verbatim"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(sent)) {
    if (!FORWARD.test(name)) continue;
    out[name] = value;
    if (mode === "verbatim") continue;
    if (value && value === routeName(fromUrl)) out[name] = routeName(toUrl);
    else if (PER_REQUEST.has(name) && UUID.test(value)) out[name] = randomUUID();
  }
  return out;
}

/** What `apiHeaders` will do, for the log: header names and kinds, no values. */
export function describeHeaders(sent: Record<string, string>, fromUrl: string): string {
  const names = Object.keys(sent).filter((n) => FORWARD.test(n));
  const follow = names.filter((n) => sent[n] && sent[n] === routeName(fromUrl));
  const ids = [...PER_REQUEST].filter((n) => n in sent).map((n) => `${n} ${UUID.test(sent[n]) ? "uuid" : "other"}`);
  return `site headers ${names.length}, carrying the route name: ${follow.join(", ") || "none"}, request ids: ${ids.join(", ") || "none"}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const dashed = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (d: Date, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);

/** Whole local days from `start` to `end`, cut at month ends: [first, last] pairs with no overlap. */
export function monthChunks(start: Date, end: Date): [Date, Date][] {
  const chunks: [Date, Date][] = [];
  for (let from = day(start); from <= day(end); ) {
    const monthEnd = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const to = monthEnd < day(end) ? monthEnd : day(end);
    chunks.push([from, to]);
    from = day(to, 1);
  }
  return chunks;
}

/** "2026-11-03 00:00:00" (the bank's local time) -> ISO, the way the library's other scrapers store dates. */
export function toIso(s: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** One row of the site's list -> a transaction, or null when it lacks a date or an amount. */
export function mapRow(row: DigitalRow, currency = "ILS"): Txn | null {
  const date = toIso(row.date);
  if (!date || typeof row.amount !== "number" || !Number.isFinite(row.amount)) return null;
  return {
    type: "normal",
    // The reference number is what a statement shows and does not change between visits.
    identifier: row.referenceNumber ? String(row.referenceNumber) : undefined,
    date,
    processedDate: date,
    originalAmount: row.amount,
    originalCurrency: currency,
    chargedAmount: row.amount,
    description: (row.description ?? "").trim(),
    memo: (row.extendedDescription ?? row.extendedDescription1 ?? "").trim(),
    status: "completed",
  };
}

/** "123-45678/90" -> "123-45678_90", the form the library's Leumi scraper has always used. */
export const accountNumberOf = (masked: string) => masked.replace("/", "_").replace(/[^\d-_]/g, "");

// The site names a foreign account's currency in Hebrew; its own codes ("001", "049") are not ISO ones.
// ponytail: the common few; another currency's account is skipped and named in the log until added here.
const CURRENCIES: Record<string, string> = { "דולר": "USD", "דולר ארה\"ב": "USD", "אירו": "EUR", "ליש\"ט": "GBP", "לירה שטרלינג": "GBP", "פרנק שוויצרי": "CHF" };
export const isoCurrency = (name: string | undefined) => CURRENCIES[(name ?? "").trim()];

/** The calendar day before a stored date, in the same local time toIso read the bank's date in: yyyy-mm-dd. */
export const dayBefore = (iso: string) => { const d = new Date(iso); return dashed(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); };

/** Rows of the site's own list that the date-range result lacks, from `fromDay` (yyyy-mm-dd) on. */
export function missingFrom(rows: DigitalRow[], siteRows: DigitalRow[], fromDay: string): DigitalRow[] {
  const key = (r: DigitalRow) => r.transactionID ?? `${r.referenceNumber}|${r.date}|${r.amount}|${r.description}`;
  const have = new Set(rows.map(key));
  return siteRows.filter((r) => (r.date ?? "").slice(0, 10) >= fromDay && !have.has(key(r)));
}

const SIGN_IN_STEPS: [string, (url: URL, method: string) => boolean][] = [
  ["login", (u) => u.pathname.endsWith("/auth/login")],
  ["authenticate", (u, m) => m === "POST" && u.pathname === "/authenticate"],
  ["sso", (u) => /SSOLogin\.aspx$/i.test(u.pathname)],
];

/** Records which sign-in requests the page made and how the bank answered, for the failure message. */
export function watchSignIn(page: Page, seen: Map<string, number>): void {
  page.on("response", (res: HTTPResponse) => {
    try {
      const url = new URL(res.url());
      for (const [name, matches] of SIGN_IN_STEPS) if (matches(url, res.request().method())) seen.set(name, res.status());
    } catch { /* not a URL we care about */ }
  });
}

const LANDED = /\/staticcontent\/digitalfront\/|ebanking\/SO\/SPA\.aspx/i;

/**
 * After the form is submitted: resolves once the page is the new site, the old site, a wrong-password notice
 * or the change-password form (the library then names which). Unlike the library's own wait, one of these
 * timing out does not end the wait for the others.
 */
export async function waitForPostLogin(page: Page, signIn: Map<string, number>, timeout = 60_000): Promise<void> {
  try {
    await Promise.any([
      page.waitForFunction(() => /\/staticcontent\/digitalfront\/|ebanking\/SO\/SPA\.aspx/i.test(location.href), { timeout }),
      page.waitForSelector(`xpath//div[contains(string(),"${INVALID_PASSWORD_MSG}")]`, { timeout }),
      page.waitForSelector('form input[name="newPwd"]', { timeout }),
    ]);
  } catch {
    if (LANDED.test(page.url())) return; // it arrived while the waits were being torn down
    const steps = SIGN_IN_STEPS.map(([name]) => `${name} ${signIn.get(name) ?? "not sent"}`).join(", ");
    const formShown = await page.$('input[placeholder="סיסמה"]').then(Boolean, () => false);
    const title = await page.title().catch(() => "");
    throw fail("sign-in did not reach an account page", [`requests: ${steps}`, `page ${path(page.url())}`, `title ${title.replace(/\d/g, "9")}`, `form still shown: ${formShown ? "yes" : "no"}`]);
  }
}

interface Opened { url: string; headers: Record<string, string>; derived?: boolean }
interface Wanted { index: number; accountNumber: string; balance?: number; currency: string }
interface FxEntry { index?: number; currencyCode?: string; currencyName?: string; MaskedFXWithoutType?: string; balanceIncludingTodayILS?: number }
interface ByClient { accountsByClients?: { foreignAccounts?: FxEntry[] }[] }
type Mode = "adapted" | "verbatim";
const BY_CLIENT = /\/accounts\/foreignaccountsbyclient\/(\d+)(?=\?|$)/;

const entriesOf = (json: ByClient) => (json.accountsByClients ?? []).flatMap((c) => c.foreignAccounts ?? []);
const short = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Leumi new site: /, "").replace(/ \[[\s\S]*$/, "");
const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);

/**
 * On the new site, after sign-in: every shekel account, then every foreign-currency account, with transactions
 * from `startDate` to today. A foreign account's amounts are still in its own currency (chargedAmount too).
 * `notes` is filled with what happened and is logged on success and included in the error on failure.
 */
export async function fetchDigitalAccounts(page: Page, startDate: Date, notes: string[]): Promise<DigitalResultAccount[]> {
  let token: string | undefined; // newest session token on the site's own transactions calls, in case it is renewed
  const lists: Partial<Record<"ils" | "foreign", { accountsItems?: DigitalAccount[] }>> = {};
  const byClient = new Map<number, FxEntry[]>(); // foreign account asked about -> its client's foreign accounts
  let byClientAsk: Opened | undefined; // the site's own by-client request, to ask about another client the same way
  let siteCalls = 0;
  const opened = new Map<number, Opened>(); // account -> the site's own request for its rows
  const siteRows = new Map<number, DigitalRow[]>(); // account -> the rows the site itself was shown
  const ours = new Set<string>();

  const onRequest = (req: HTTPRequest) => {
    const url = req.url();
    if (!TRX_API.test(url) || ours.has(url)) return;
    const headers = req.headers();
    if (!headers.authorization) return;
    token = headers.authorization;
    if (BY_CLIENT.test(url)) byClientAsk = { url, headers };
    const m = SITE_URL.exec(url);
    if (m) opened.set(Number(m[4]), { url, headers });
  };
  const onResponse = (res: HTTPResponse) => {
    const url = res.url();
    if (!url.includes("/v1/corp/") || res.status() !== 200 || ours.has(url)) return;
    siteCalls++;
    if (!TRX_API.test(url)) return;
    const list = /\/available-accounts\/(ils|foreign)(\?|$)/.exec(url);
    if (list) res.json().then((json) => { lists[list[1] as "ils" | "foreign"] = json; }, () => {});
    const asked = BY_CLIENT.exec(url);
    if (asked) res.json().then((json: ByClient) => { byClient.set(Number(asked[1]), entriesOf(json)); }, () => {});
    const m = SITE_URL.exec(url);
    if (m) res.json().then((json: DigitalRows) => { siteRows.set(Number(m[4]), rowsOf(json) ?? []); }, () => {});
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  // The site opens the page itself, so the site picks the account and sends the request: by its router,
  // else by one of its own links, and only as a last resort by loading the address afresh.
  // The language ("/he") is part of the site's page addresses. Taken once, from the page the sign-in landed on.
  const lang = /\/staticcontent\/digitalfront(\/[a-z]{2})(?=[/?#]|$)/i.exec(page.url())?.[1] ?? "";
  const open = (pathname: string, accountIndex?: number): Promise<string> =>
    page.evaluate((pathname, index, lang) => {
      const router = (window as unknown as { next?: { router?: { push?: (to: unknown) => unknown; basePath?: string } } }).next?.router;
      const search = index === undefined ? "" : `?accountIndex=${index}`;
      if (typeof router?.push === "function") {
        // The language belongs in the address given to the router: on the real site, asking for the page
        // without it gave a 404. Left out only if the router's own base already ends with it.
        void router.push(`${(router.basePath ?? "").endsWith(lang) ? "" : lang}${pathname}/${search}`);
        return "router";
      }
      const links = [...document.querySelectorAll<HTMLAnchorElement>(`a[href*="${pathname}"]`)];
      const link = index === undefined ? links[0] : links.find((a) => new URL(a.href).searchParams.get("accountIndex") === String(index));
      if (link) { link.click(); return "link"; }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- this runs in the bank's page, not in Penny
      location.href = `/staticcontent/digitalfront${lang}${pathname}/${search}`;
      return "reload";
    }, pathname, accountIndex, lang).catch(() => "reload"); // a reload ends the script that asked for it

  /**
   * Our own GET with the headers of the site's request `own`: adapted, else verbatim; `state` keeps what worked.
   * `empty` is the answer to a 204: the bank says "no content" for a date range with no rows in it.
   */
  const bankGet = async <T,>(url: string, own: Opened, ok: (json: T | undefined) => boolean, state: { mode?: Mode; calls: number }, what: string, empty?: T): Promise<T | undefined> => {
    ours.add(url);
    const adapted = apiHeaders(own.headers, own.url, url, "adapted");
    const verbatim = apiHeaders(own.headers, own.url, url, "verbatim");
    const forms = state.mode ? [state.mode] : JSON.stringify(adapted) === JSON.stringify(verbatim) ? ["verbatim" as const] : ["adapted" as const, "verbatim" as const];
    for (const form of forms) {
      const headers = { ...(form === "adapted" ? adapted : verbatim), ...(token ? { authorization: token } : {}) };
      const res = await page.evaluate(async (u, h) => {
        const r = await fetch(u, { headers: h, credentials: "include" });
        return { status: r.status, text: await r.text() };
      }, url, headers);
      state.calls++;
      await sleep(400); // unhurried, like a person paging through
      let json: (T & { fault?: { detail?: { errorcode?: string } } }) | undefined;
      try { json = JSON.parse(res.text); } catch { /* not json */ }
      if (res.status === 200 && ok(json)) { state.mode = form; return json; }
      if (res.status === 204 && empty !== undefined) { state.mode = form; return empty; }
      notes.push(`${what} (${form} headers) answered ${res.status} ${String(json?.fault?.detail?.errorcode ?? "").slice(0, 60)}`.trim());
      if (res.status === 401 || res.status === 403) break; // the session is gone: do not keep knocking
    }
    return undefined;
  };

  /** Every row of each account from startDate to today. `strict`: a failure fails the run, else skips the account. */
  const fetchAccounts = async (wanted: Wanted[], pathname: string, strict: boolean): Promise<DigitalResultAccount[]> => {
    const state: { mode?: Mode; calls: number } = { calls: 0 }; // which header form the bank accepted, calls per account
    let cut = 0;
    const getRows = async (index: number, from: Date, to: Date): Promise<DigitalRows> => {
      const own = opened.get(index)!;
      const url = byDatesUrl(own.url, ymd(from), ymd(to));
      if (!url) throw fail("the site's transactions address is not the expected one", [...notes, path(own.url).replace(/\d{3,}/g, "9")]);
      const json = await bankGet<DigitalRows>(url, own, (j) => Array.isArray(rowsOf(j)), state, "date-range call", {});
      if (!json) throw fail("the bank refused the date-range request", notes);
      return json;
    };

    // A range the site cuts short (additionalTransactionsFlag) is halved until every part is whole.
    const rowsBetween = async (index: number, from: Date, to: Date, seenRefs: Set<string>): Promise<DigitalRow[]> => {
      const json = await getRows(index, from, to);
      seenRefs.add(json.iban ?? json.currentAccountReference ?? "");
      const rows = rowsOf(json) ?? [];
      if (!json.additionalTransactionsFlag) return rows;
      cut++;
      const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
      if (days < 1) throw fail(`a single day is marked as having more transactions than the ${rows.length} returned (${cut} of ${state.calls} calls so far were marked that way)`, notes);
      const mid = day(from, Math.floor(days / 2));
      return [...(await rowsBetween(index, from, mid, seenRefs)), ...(await rowsBetween(index, day(mid, 1), to, seenRefs))];
    };

    const result: DigitalResultAccount[] = [];
    const done: { index: number; ref: string; ids: Set<string> }[] = []; // to prove each account really is a different one
    for (const account of wanted) {
      const { index } = account;
      try {
        if (!opened.has(index)) {
          const how = await open(pathname, index);
          if (!(await until(() => opened.has(index), 30_000))) {
            const shown = await page.evaluate(() => new URLSearchParams(location.search).get("accountIndex")).catch(() => null);
            notes.push(`account ${index}: opened by ${how}, but the site asked for no transactions of it (page shows account ${shown ?? "none"}; site asked for ${[...opened.keys()].join(", ") || "none"})`);
            const other = wanted.map((a) => opened.get(a.index)).find((o) => o && !o.derived);
            if (!other) throw fail(`the site did not open account ${index}`, notes);
            // Next best: the address of an account of the same kind the site did open, with this account's
            // number. Kept only if the bank then answers with a different account (checked below).
            opened.set(index, { url: other.url.replace(/\/accounts\/\d+\//, `/accounts/${index}/`), headers: other.headers, derived: true });
            notes.push(`account ${index}: using its address built from another account's`);
          }
        }
        const own = opened.get(index)!;
        if (done.length === 0) {
          notes.push(describeHeaders(own.headers, own.url));
          // The foreign route names were masked in the capture, so say which one the site really used.
          if (!strict) notes.push(`foreign route ${SITE_URL.exec(own.url)?.[2] ?? "?"}+default/bydates, taken from the site's ${/\/bydates\?/.test(own.url) ? "date-range" : "latest"} request`);
        }

        const seenRefs = new Set<string>();
        const rows: DigitalRow[] = [];
        const chunks = monthChunks(startDate, new Date());
        state.calls = 0;
        cut = 0;
        for (const [from, to] of chunks) rows.push(...(await rowsBetween(index, from, to, seenRefs)));

        seenRefs.delete("");
        if (seenRefs.size > 1) throw fail(`account ${index} answered with more than one account`, notes);
        if (seenRefs.size === 0) {
          // With no rows there is nothing that could be another account's: its balance comes from the account list.
          if (own.derived && rows.length > 0) throw fail(`account ${index} could not be told apart from the others`, notes);
          notes.push(`account ${index}: ${rows.length ? "the bank sent no account reference to check against" : "no rows in the window"}`);
        }
        const ref = [...seenRefs][0] ?? "";
        const ids = new Set(rows.flatMap((r) => (r.transactionID ? [r.transactionID] : [])));
        for (const prev of done) {
          if (!ref || prev.ref !== ref) continue;
          // A foreign account per currency may share one IBAN; different accounts still have different rows.
          if (strict || ids.size === 0 || [...ids].some((id) => prev.ids.has(id))) throw fail(`accounts ${prev.index} and ${index} returned the same account`, notes);
          notes.push(`accounts ${prev.index} and ${index} share an account reference but no rows`);
        }

        // The rows the site itself was shown are an independent check: any of them the date-range result lacks
        // (today's, if the bank leaves those out of a range) are added, and counted in the log.
        const site = siteRows.get(index);
        const extra = site ? missingFrom(rows, site, dashed(day(startDate))) : [];
        rows.push(...extra);

        const txns = rows.map((r) => mapRow(r, account.currency));
        const bad = txns.filter((t) => t === null).length;
        if (bad > 0) throw fail(`${bad} of ${rows.length} rows for account ${index} had no date or amount`, notes);
        done.push({ index, ref, ids });
        notes.push(
          `account ${index}: ${rows.length} rows, ${dashed(chunks[0][0])} to ${dashed(chunks.at(-1)![1])}, ${state.calls} calls (${cut} cut short and split), ${state.mode} headers, ` +
          (site ? `site's own list ${site.length} rows of which ${extra.length} were missing from the date range and added` : "no list from the site to compare with"),
        );
        result.push({ accountNumber: account.accountNumber, balance: account.balance, txns: txns as Txn[] });
      } catch (e) {
        if (strict) throw e;
        notes.push(`account ${index}: skipped, ${short(e)}`);
      }
    }
    return result;
  };

  try {
    // The address changes before the site's code has started. Its router and its first calls mean it is up.
    const router = await page
      .waitForFunction(() => typeof (window as unknown as { next?: { router?: { push?: unknown } } }).next?.router?.push === "function", { timeout: 30_000 })
      .then(() => true, () => false);
    await until(() => siteCalls > 0, 8_000);
    notes.push(`site router ${router ? "ready" : "missing"}, site calls seen ${siteCalls}`);

    notes.push(`opened transactions page by ${await open(NIS_PAGE)}`);
    if (!(await until(() => lists.ils !== undefined, 15_000))) {
      // The site's own link names an account; in the capture it was accountIndex 1.
      notes.push(`no account list yet, opened account 1 by ${await open(NIS_PAGE, 1)}`);
      if (!(await until(() => lists.ils !== undefined, 40_000))) throw fail("the account list did not load", [...notes, `page ${path(page.url())}`]);
    }
    const accounts = (lists.ils?.accountsItems ?? []).filter((a) => typeof a.accountIndex === "number" && a.maskedNumber);
    if (accounts.length === 0) throw fail("the account list was empty or in an unknown form", notes);
    notes.push(`accounts ${accounts.length}`);
    const result = await fetchAccounts(
      accounts.map((a) => ({ index: a.accountIndex!, accountNumber: accountNumberOf(a.maskedNumber!), balance: num(a.balanceIncludingToday), currency: "ILS" })),
      NIS_PAGE,
      true,
    );

    try {
      notes.push(`foreign: opened page by ${await open(FX_PAGE)}`);
      if (!(await until(() => lists.foreign !== undefined, 20_000))) throw new Error("the foreign account list did not load");
      const listed = (lists.foreign?.accountsItems ?? []).filter((a) => typeof a.accountIndex === "number");
      notes.push(`foreign list ${listed.length}: ${listed.map((a) => `${a.accountIndex} ${a.currencyCode ?? "?"}`).join(", ") || "none"}`);
      if (listed.length) await until(() => byClient.size > 0, 10_000);
      // The list is one entry per client. A client the site did not ask about is asked about the way it did.
      const ask = { calls: 0 } as { mode?: Mode; calls: number };
      for (const a of listed) {
        if ([...byClient.values()].flat().some((e) => e.index === a.accountIndex)) continue;
        if (!byClientAsk) { notes.push(`no by-client request from the site to ask about account ${a.accountIndex} with`); break; }
        const url = byClientAsk.url.replace(BY_CLIENT, `/accounts/foreignaccountsbyclient/${a.accountIndex}`);
        const json = await bankGet<ByClient>(url, byClientAsk, (j) => Array.isArray(j?.accountsByClients), ask, `by-client call for account ${a.accountIndex}`);
        if (json) byClient.set(a.accountIndex!, entriesOf(json));
      }
      for (const [asked, entries] of byClient) notes.push(`by-client ${asked}: ${entries.map((e) => `${e.index ?? "?"} ${e.currencyCode ?? "?"} ${e.currencyName ?? "?"}`).join(", ") || "none"}`);

      const wanted: Wanted[] = [];
      for (const e of [...byClient.values()].flat()) {
        if (typeof e.index !== "number" || wanted.some((w) => w.index === e.index)) continue;
        const currency = isoCurrency(e.currencyName);
        // The account number is part of every row's dedupe key, so it comes from this one field or not at all.
        if (!currency || !e.MaskedFXWithoutType) {
          notes.push(`account ${e.index}: skipped, ${currency ? "the site gave no account number for it" : `currency ${e.currencyName ? `"${e.currencyName}"` : "not named by the site"} (code ${e.currencyCode ?? "none"}) is not one this knows`}`);
          continue;
        }
        notes.push(`account ${e.index}: ${currency} (site code ${e.currencyCode ?? "none"})`);
        // The balance in shekels, as the bank values it: Penny's balances feed cash and net worth in shekels.
        wanted.push({ index: e.index, accountNumber: `${accountNumberOf(e.MaskedFXWithoutType)} ${currency}`, balance: num(e.balanceIncludingTodayILS), currency });
      }
      if (listed.length && wanted.length === 0) notes.push("no foreign account could be identified");
      result.push(...(await fetchAccounts(wanted, FX_PAGE, false)));
    } catch (e) {
      notes.push(`foreign accounts skipped: ${short(e)}`);
    }
    return result;
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}
