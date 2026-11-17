// A stand-in for Bank Leumi's new website, for tests/leumi-digital.e2e.test.ts. It behaves the way the masked
// capture showed the real one does: the data API refuses a request without the headers the site's own code
// sends, an account is opened by the site's page (?accountIndex=N), and a long date range is cut short with
// additionalTransactionsFlag. Every value is invented.
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeLeumiOptions {
  /** "constant": route_app_name is always the same. "perRoute": it must name the address being called. */
  routeHeader?: "constant" | "perRoute";
  /** "unique": an x-message-id may be used once. "repeat": only ids the site's own code sent are accepted. */
  messageIds?: "unique" | "repeat";
  /** false: every accountIndex answers with the first account of its kind, which a scraper must notice.
   *  "foreign": only foreign accounts do that. */
  indexSelects?: boolean | "foreign";
  /** true: there are foreign-currency accounts. Like the capture: two clients, the first with USD and EUR, the
   *  second with USD; the page's list has one entry per client (both USD) and only the by-client answer has all. */
  foreign?: boolean;
  /** true: both foreign accounts answer with one IBAN, as one account per currency may. */
  fxSharedIban?: boolean;
  /** An account with no rows at all. Like the real bank, it answers "204 No Content" instead of an empty list. */
  emptyAccount?: number;
  /** true: like the real site with a date filter on, switching foreign accounts sends a date-range request. */
  siteSendsByDates?: boolean;
  /** false: submitting the sign-in form goes nowhere. */
  signInWorks?: boolean;
  /** true: every date-range answer claims there are more rows, whatever it returned. */
  flagAlways?: boolean;
  /** true: the site's page always opens account 1, whatever account it is asked for. */
  pageIgnoresAccount?: boolean;
  /** true: a date range leaves out today's rows; only the site's own latest list has them. */
  rangeSkipsToday?: boolean;
}

interface Row { date: string; description: string; extendedDescription: string; amount: number; referenceNumber: string; transactionID: string }

const pad = (n: number) => String(n).padStart(2, "0");
const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Account 1 is busy (3 rows a day, so a month exceeds one response), account 2 is quiet. Newest first. */
export function fakeRows(accountIndex: number, days = 120): Row[] {
  const rows: Row[] = [];
  const today = new Date();
  for (let ago = 0; ago < days; ago++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago);
    const perDay = accountIndex === 1 ? 3 : ago % 3 === 0 ? 1 : 0;
    for (let n = 0; n < perDay; n++) {
      rows.push({
        date: `${dayString(d)} 00:00:00`,
        description: `תנועה ${accountIndex}-${ago}-${n}`,
        extendedDescription: `פירוט ${ago}`,
        amount: n === 0 ? 1000 + ago : -(50 + ago + n),
        referenceNumber: String(700000 + ago * 10 + n),
        transactionID: `${accountIndex}${String(ago).padStart(4, "0")}${n}`,
      });
    }
  }
  return rows;
}

export const FAKE_FX = [
  { accountIndex: 3, client: "A", currencyCode: "001", currencyName: "דולר", number: "900-555555/01", balanceIncludingToday: 1500.5, balanceIncludingTodayILS: 5551.85, iban: "IL000000000000000000003" },
  { accountIndex: 4, client: "A", currencyCode: "049", currencyName: "אירו", number: "900-555555/01", balanceIncludingToday: 210, balanceIncludingTodayILS: 850.5, iban: "IL000000000000000000004" },
  { accountIndex: 5, client: "B", currencyCode: "001", currencyName: "דולר", number: "900-777777/02", balanceIncludingToday: 75, balanceIncludingTodayILS: 277.5, iban: "IL000000000000000000005" },
];

export const FAKE_ACCOUNTS = [
  { accountIndex: 1, maskedNumber: "900-11111/22", balanceIncludingToday: 4321.5, iban: "IL000000000000000000001" },
  { accountIndex: 2, maskedNumber: "900-333333/44", balanceIncludingToday: -77.25, iban: "IL000000000000000000002" },
];
const CAP = 40; // rows per response

const html = (body: string) => `<!doctype html><meta charset="utf-8"><title>לאומי עסקים - בדיקה</title><body>${body}</body>`;

const LOGON = html(`
  <form id="f"><input placeholder="שם משתמש" name="user"><input placeholder="סיסמה" name="password" type="password"><button type="submit">כניסה</button></form>
  <script>
    document.getElementById("f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await fetch("/api/v2/auth/login", { method: "POST" });
      if (!r.ok) return;
      await fetch("/authenticate", { method: "POST" });
      location.href = "/staticcontent/digitalfront/he/#ts=eyJmYWtl.eyJmYWtl.c2ln";
    });
  </script>`);

const app = (routeHeader: string, pageIgnoresAccount: boolean, siteSendsByDates: boolean) => html(`
  <script>
    const base = "/v1/corp/ui-corp-transactions/";
    const fx = "/v1/corp/ui-corp-transactions-fx/";
    let token = "", listed = false, fxListed = false, fxFirst = "";
    const headers = (route) => ({
      accept: "application/json", authorization: "Bearer " + token, route_app_name: ${JSON.stringify(routeHeader)} === "perRoute" ? route : "digitalfront",
      "x-message-id": crypto.randomUUID(), "x-transaction-id": crypto.randomUUID(), "x-session-id": "fake-session", "x-app-id": "digitalfront", "x-uid": "fake-uid",
    });
    // Like the real site, the app starts a moment after the address changes: first its own calls, then its router.
    setTimeout(async () => {
      token = (await (await fetch("/fake/token")).json()).token;
      fetch("/v1/corp/ui-corp-home-page/menuparameters/digitalfront/menuparameters", { headers: headers("menuparameters") });
    }, 700);
    // The part of Next.js's router a scraper uses. Like the real site's, its routes start with the language,
    // and an address it does not know is loaded from the server, which has no such page.
    setTimeout(() => { window.next = { router: { basePath: "/staticcontent/digitalfront", push: async (to) => {
      const url = new URL(to, location.origin);
      if (url.pathname === "/he/foreign-accounts/foreign-transactions/") {
        const asked = url.searchParams.get("accountIndex");
        history.pushState({}, "", "/staticcontent/digitalfront" + url.pathname + (asked ? "?accountIndex=" + asked : ""));
        token = (await (await fetch("/fake/token")).json()).token;
        if (!fxListed) {
          fxListed = true;
          const list = await (await fetch(fx + "transactionsavailableaccountsforeign/digitalfront/available-accounts/foreign?comboMethod=false", { headers: headers("transactionsavailableaccountsforeign") })).json();
          fxFirst = String(list.accountsItems[0]?.accountIndex ?? "");
          if (fxFirst) fetch(fx + "foreignaccountsbyclient/digitalfront/accounts/foreignaccountsbyclient/" + fxFirst, { headers: headers("foreignaccountsbyclient") });
        }
        if (!fxFirst) return;
        const index = ${pageIgnoresAccount} ? fxFirst : asked || fxFirst;
        if (asked && ${siteSendsByDates}) {
          fetch(fx + "foreigntransactionsbydates/digitalfront/accounts/" + index + "/foreigntransactions/bydates?periodType=1&fromDate=20200101&toDate=20200131", { headers: headers("foreigntransactionsbydates") });
        } else {
          fetch(fx + "foreigntransactionsdefault/digitalfront/accounts/" + index + "/foreigntransactions/default?operationMode=1", { headers: headers("foreigntransactionsdefault") });
        }
        return;
      }
      if (url.pathname !== "/he/nis-accounts/nis-transactions/") { location.href = "/staticcontent/digitalfront" + url.pathname; return; }
      const index = ${pageIgnoresAccount} ? "1" : url.searchParams.get("accountIndex") || "1";
      history.pushState({}, "", "/staticcontent/digitalfront" + url.pathname + "?accountIndex=" + index);
      token = (await (await fetch("/fake/token")).json()).token; // the session token is renewed now and then
      if (!listed) { listed = true; fetch(base + "transactionsavailableaccountsils/digitalfront/available-accounts/ils?comboMethod=true", { headers: headers("transactionsavailableaccountsils") }); }
      fetch(base + "transactionsdefault/digitalfront/accounts/" + index + "/transactions/default?operationMode=1", { headers: headers("transactionsdefault") });
    } } }; }, 1500);
  </script>`);

export async function startFakeLeumi(options: FakeLeumiOptions = {}) {
  const { routeHeader = "constant", messageIds = "unique", indexSelects = true, signInWorks = true, flagAlways = false, pageIgnoresAccount = false, rangeSkipsToday = false } = options;
  const { foreign = false, fxSharedIban = false, siteSendsByDates = false, emptyAccount } = options;
  const fxAccounts = foreign ? FAKE_FX : [];
  let token = "";
  const seenIds = new Set<string>();
  const siteIds = new Set<string>();
  const refused: string[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const send = (status: number, body: unknown, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "content-type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const p = url.pathname;
    if (p === "/he") return send(200, html("home"), "text/html; charset=utf-8");
    if (p === "/authenticate/logon") return send(200, LOGON, "text/html; charset=utf-8");
    if (p === "/api/v2/auth/login") return send(signInWorks ? 200 : 403, {});
    if (p === "/authenticate") return send(200, {});
    if (p === "/staticcontent/digitalfront/he/") return send(200, app(routeHeader, pageIgnoresAccount, siteSendsByDates), "text/html; charset=utf-8");
    if (p.startsWith("/v1/corp/ui-corp-home-page/")) return send(200, { ok: true });
    if (p === "/fake/token") { token = `fake-token-${Math.random().toString(36).slice(2)}`; return send(200, { token }); }

    const api = /^\/v1\/corp\/ui-corp-transactions(?:-fx)?\/([^/]+)\/digitalfront\/(.*)$/.exec(p);
    if (!api) return send(404, {});
    const [, route, rest] = api;
    const h = req.headers;
    const id = String(h["x-message-id"] ?? "");
    const fromSite = !url.searchParams.has("periodType"); // the fake site's own page never asks for a date range
    const problem =
      h.authorization !== `Bearer ${token}` ? "token"
      : h.route_app_name !== (routeHeader === "perRoute" ? route : "digitalfront") ? "route_app_name"
      : !id ? "message id missing"
      : messageIds === "unique" && seenIds.has(id) ? "message id reused"
      : messageIds === "repeat" && !fromSite && !siteIds.has(id) ? "message id unknown"
      : null;
    if (problem) {
      refused.push(`${route}: ${problem}`);
      return send(400, { fault: { faultstring: `refused: ${problem}`, detail: { errorcode: "steps.fake.Refused" } } });
    }
    seenIds.add(id);
    if (fromSite) siteIds.add(id);

    if (rest === "available-accounts/ils") {
      return send(200, { comboActualMethod: 1, accountsItems: FAKE_ACCOUNTS.map(({ accountIndex, maskedNumber, balanceIncludingToday }) => ({ accountIndex, maskedNumber, balanceIncludingToday })) });
    }
    if (rest === "available-accounts/foreign") {
      const perClient = fxAccounts.filter((a, i) => fxAccounts.findIndex((b) => b.client === a.client) === i);
      return send(200, { comboActualMethod: 1, accountsItems: perClient.map(({ accountIndex, balanceIncludingToday }) => ({ accountIndex, currencyCode: "001", balanceIncludingToday })) });
    }
    const byClient = /^accounts\/foreignaccountsbyclient\/(\d+)$/.exec(rest);
    if (byClient) {
      const client = fxAccounts.find((a) => a.accountIndex === Number(byClient[1]))?.client;
      const accounts = fxAccounts.filter((a) => a.client === client);
      return send(200, { accountsByClients: [{ foreignAccounts: accounts.map((a) => ({ index: a.accountIndex, currencyCode: a.currencyCode, currencyName: a.currencyName, MaskedFXWithoutType: a.number, balanceIncludingTodayILS: a.balanceIncludingTodayILS })) }] });
    }
    const trx = /^accounts\/(\d+)\/(transactions|foreigntransactions)\/(default|bydates)$/.exec(rest);
    if (!trx) return send(404, {});
    const asked = Number(trx[1]);
    const first = asked >= 3 ? 3 : 1;
    const selected = indexSelects === true || (indexSelects === "foreign" && asked < 3) ? asked : first;
    const account = [...FAKE_ACCOUNTS, ...fxAccounts].find((a) => a.accountIndex === selected);
    if (!account) return send(404, {});
    if (account.accountIndex === emptyAccount) { res.writeHead(204); return res.end(); }
    let rows = fakeRows(account.accountIndex);
    if (trx[3] === "bydates") {
      const day = (s: string | null) => `${s?.slice(0, 4)}-${s?.slice(4, 6)}-${s?.slice(6, 8)}`;
      const from = day(url.searchParams.get("fromDate"));
      const to = day(url.searchParams.get("toDate"));
      const today = dayString(new Date());
      rows = rows.filter((r) => r.date.slice(0, 10) >= from && r.date.slice(0, 10) <= to && !(rangeSkipsToday && r.date.slice(0, 10) === today));
    }
    const page = rows.slice(0, CAP);
    const listed = trx[2] === "foreigntransactions"
      ? { historyForeignTrxItems: page.map(({ extendedDescription, ...r }) => ({ ...r, extendedDescription1: extendedDescription })) }
      : { historyILSTrxItems: page };
    const iban = fxSharedIban && account.accountIndex >= 3 ? "IL000000000000000000099" : account.iban;
    send(200, { additionalTransactionsFlag: flagAlways ? trx[3] === "bydates" : rows.length > CAP, iban, currentAccountReference: `ref-${iban}`, ...listed, isFilterIncludeToday: true });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, refused, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
