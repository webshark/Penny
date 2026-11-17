#!/usr/bin/env node
// One-off helper for writing a scraper for Bank Leumi's new website.
//
// It opens a browser, you sign in yourself, and it records the SHAPE of what the site sends while you
// click around: addresses, field names and value patterns ("string:99/99/9999"), never the values.
// It does not type, read or accept credentials. During the sign-in step it keeps addresses, field
// names and types only. The result is one file in Penny's data folder.
//
//   node scripts/leumi-discover.mjs
//
// What the file still shows: page titles as they are (digits masked); field, header, cookie and storage
// NAMES; the length and letter/digit layout of each value (so how many digits an amount has, and its
// sign); and address parts without a 4-digit run, such as a 3-digit number or a short word.
//
// The browser is the same Chromium with the same flags and user agent as Penny's bank sync, but visible
// (the sync is hidden unless "Show browser during sync" is on). So a pass here predicts the visible
// mode. No extra bot-detection workarounds are added on purpose.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { maskKey, maskRequestBody, maskTitle, maskUrl, shapeOf, typesOnly } from "./leumi-discover-mask.mjs";

// A different start address and a hidden window exist only for the dry run against a local test page.
const START = process.argv[2] ?? "https://hb2.bankleumi.co.il/authenticate/logon";
const HEADLESS = process.env.LEUMI_DISCOVER_HEADLESS === "1";
const startHost = new URL(START).hostname;
const allowedHost = (h) => h === startHost || /(^|\.)(bankleumi|leumi)\.co\.il$/.test(h);

// Sign-in pages and the identity service: for these only address, status and field names are kept.
const AUTH = /authenticat|gate-?keeper|logon|login|\/auth\b|password|otp/i;
const isAuth = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.startsWith("sa.") || AUTH.test(x.pathname);
  } catch {
    return true;
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.PENNY_DATA_DIR ? path.resolve(process.env.PENNY_DATA_DIR) : path.join(root, "data");
const outFile = path.join(dataDir, "leumi-discovery.json");

const started = Date.now();
const secs = () => Math.round((Date.now() - started) / 1000);
const out = {
  tool: "leumi-discover",
  version: 1,
  startedAt: new Date(started).toISOString(),
  start: maskUrl(START),
  navigations: [],
  calls: [],
  repeats: {},
  otherHosts: {},
  storage: null,
  probes: [],
  endedBy: null,
};

// Written after every change and on exit: a lost capture would cost another bank sign-in.
function save() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // Last line of defence: nothing token-shaped leaves, whatever the masking above missed.
  const json = JSON.stringify(out, null, 1).replace(/eyJ[A-Za-z0-9_-]{10,}[A-Za-z0-9._-]*/g, "[dropped]");
  fs.writeFileSync(`${outFile}.tmp`, json, { mode: 0o600 });
  fs.renameSync(`${outFile}.tmp`, outFile);
}
let timer = null;
function touch() {
  timer ??= setTimeout(() => { timer = null; save(); }, 500);
}

const counts = new Map(); // "GET host/path" -> times seen
const replay = new Map(); // same key -> the real address. Memory only, never written.
let corpBase = null; // real address prefix of the transactions API, if the site calls it. Memory only.
let current = null; // the tab the user is looking at

function attach(page) {
  current = page;
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    current = page;
    const url = maskUrl(frame.url());
    const last = out.navigations.at(-1);
    if (last && JSON.stringify(last.url) === JSON.stringify(url)) return;
    const nav = { at: secs(), url };
    out.navigations.push(nav);
    touch();
    setTimeout(async () => {
      try { nav.title = maskTitle(await page.title()); touch(); } catch { /* the tab moved on */ }
    }, 1500);
  });
  page.on("response", async (res) => {
    try {
      const req = res.request();
      if (!["xhr", "fetch"].includes(req.resourceType())) return;
      const url = req.url();
      const { hostname, pathname } = new URL(url);
      if (!allowedHost(hostname)) { out.otherHosts[hostname] = (out.otherHosts[hostname] ?? 0) + 1; touch(); return; }
      const masked = maskUrl(url);
      const signIn = isAuth(url) || isAuth(page.url());
      const body = req.postData();
      const requestBody = body ? maskRequestBody(body, signIn) : undefined;
      const key = `${req.method()} ${masked.host}${masked.path}`;
      // The same address with other parameters (another account, a date range) is a different call, and
      // those are the ones a scraper needs, so only exact repeats count, with a high limit for data calls.
      const variant = `${key}?${Object.keys(masked.query ?? {}).sort().join("&")} ${JSON.stringify(requestBody ?? null)}`;
      const seen = (counts.get(variant) ?? 0) + 1;
      counts.set(variant, seen);
      const limit = /transactions|accounts/i.test(pathname) ? 40 : 3;
      if (seen > limit || out.calls.length >= 800) { out.repeats[key] = (out.repeats[key] ?? 0) + 1; touch(); return; }
      const type = (res.headers()["content-type"] ?? "").split(";")[0];
      const entry = {
        at: secs(),
        page: maskUrl(page.url()).path,
        method: req.method(),
        url: masked,
        status: res.status(),
        type,
        requestHeaders: Object.keys(req.headers()).map(maskKey).sort(),
        requestBody,
      };
      if (signIn) entry.signInStep = true;
      out.calls.push(entry);
      touch();
      const text = await res.text();
      if (text.length > 3_000_000) { entry.shape = "too large"; return; }
      if (!/json/i.test(type) && !/^\s*[[{]/.test(text)) return; // some JSON is served as text/plain
      const json = JSON.parse(text);
      // During sign-in only field names and types; afterwards masked patterns too.
      entry.shape = signIn ? typesOnly(json) : shapeOf(json);
      touch();
      if (signIn) return;
      const i = url.indexOf("/ui-corp-transactions/");
      if (i >= 0) corpBase = url.slice(0, i + "/ui-corp-transactions/".length);
      if (req.method() === "GET" && res.status() === 200 && /transactions|accounts/i.test(pathname)) replay.set(key, url);
    } catch {
      // A body that is already gone (redirect, tab closed) is not worth stopping for.
    }
  });
}

// One plain GET from inside the page, with the session's cookies and nothing else: tells whether a
// scraper can call the site's data API directly. Never retried.
async function probe(page, url, source) {
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { credentials: "include", headers: { accept: "application/json" } });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, redirected: res.redirected, isJson: json !== undefined, json };
    } catch (e) {
      return { error: e?.name ?? "error" };
    }
  }, url);
  out.probes.push({ source, url: maskUrl(url), status: r.status, redirected: r.redirected, error: r.error, shape: r.isJson ? shapeOf(r.json) : r.status ? "not json" : undefined });
}

const ymd = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");

let finishing = false;
async function finish(reason, browser) {
  if (finishing) return;
  finishing = true;
  out.endedBy = reason;
  const page = current;
  if (reason === "enter" && page && !page.isClosed()) {
    try {
      const names = await page.evaluate(() => {
        const keys = (read) => { try { return read(); } catch { return []; } }; // an error page has no storage
        return {
          localStorage: keys(() => Object.keys(localStorage)),
          sessionStorage: keys(() => Object.keys(sessionStorage)),
          cookies: keys(() => document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter(Boolean)),
        };
      });
      out.storage = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.map(maskKey).sort()])); // names only
      if (isAuth(page.url())) {
        out.probes.push({ skipped: "still on a sign-in page" });
      } else {
        for (const url of [...replay.values()].slice(0, 4)) await probe(page, url, "an address the site itself called");
        const sawByDates = [...counts.keys()].some((k) => k.includes("bydates"));
        if (corpBase && !sawByDates) {
          await probe(page, `${corpBase}transactions/bydates?periodType=1&fromDate=${ymd(30)}&toDate=${ymd(0)}`, "an address suggested in the scraper project's issue 1106, last 30 days");
        }
      }
    } catch (e) {
      out.finishError = e?.name ?? "error";
    }
  }
  await new Promise((r) => setTimeout(r, 800)); // let responses still being read finish
  clearTimeout(timer);
  save();
  // Report first: the capture is on disk, and closing the browser can be slow.
  console.log(`\nSaved ${out.calls.length} calls and ${out.navigations.length} page changes to:\n  ${outFile}\n`);
  console.log("Pages visited (values masked):");
  for (const n of out.navigations) console.log(`  ${String(n.at).padStart(4)}s  ${n.url.host}${n.url.path}${n.title ? `  "${n.title}"` : ""}`);
  console.log("\nThe file holds names and masked patterns (letters -> a, digits -> 9), not values. Open it and check before sharing.");
  await closeBrowser(browser);
  process.exit(0);
}

// A browser that does not close within 5 seconds is killed, so the script never hangs at the end.
async function closeBrowser(browser) {
  await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  // The test browser's crash-reporter helpers start detached, can outlive it and hold the close open.
  // Only the ones that appeared during this run are removed.
  for (const p of [browser.process()?.pid, ...crashHelpers().filter((h) => !helpersBefore.has(h))]) {
    try { if (p) process.kill(p, "SIGKILL"); } catch { /* already gone */ }
  }
}

function crashHelpers() {
  try {
    return execFileSync("pgrep", ["-f", "puppeteer/chrome.*chrome_crashpad_handler"], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch {
    return []; // pgrep exits 1 when there are none
  }
}

const args = ["--disable-blink-features=AutomationControlled", "--disable-features=IsolateOrigins,site-per-process"]; // same as src/server/scrapers/index.ts
if ((process.env.PENNY_DISABLE_CHROMIUM_SANDBOX ?? process.env.SPENT_DISABLE_CHROMIUM_SANDBOX) === "1") args.push("--no-sandbox");
const helpersBefore = new Set(crashHelpers());
// handleSIGINT off: puppeteer's own Ctrl-C handler exits before the final save below can run.
const browser = await puppeteer.launch({ headless: HEADLESS, args, timeout: 60_000, handleSIGINT: false }).catch((e) => {
  console.error(`The browser did not start (${e?.name ?? "error"}). Nothing was sent to the bank. Close other heavy apps and run this again.`);
  process.exit(1);
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setUserAgent((await browser.userAgent()).replace("HeadlessChrome/", "Chrome/")); // same as scrapers/user-agent.ts
await page.setViewport({ width: 1024, height: 768 });
attach(page);
browser.on("targetcreated", async (target) => {
  const p = await target.page().catch(() => null);
  if (p && p !== page) attach(p);
});
browser.on("disconnected", () => { if (!finishing) { finishing = true; out.endedBy = "browser closed"; clearTimeout(timer); save(); console.log(`\nBrowser closed. Saved what was captured to:\n  ${outFile}`); process.exit(0); } });
process.on("SIGINT", () => {
  finishing = true;
  out.endedBy ??= "interrupted";
  clearTimeout(timer);
  save();
  closeBrowser(browser).finally(() => process.exit(130));
});

console.log(`
Leumi discovery. A browser window is opening.

  1. Sign in yourself in that window, as you normally would. This script does not type or read
     what you enter, and records nothing but addresses during sign-in.
  2. Open the shekel current account transactions (עובר ושב שקלים).
  3. Switch to your other account in the account picker, and wait for its transactions.
  4. Choose a custom date range (for example last month) and display it.
  5. Come back here and press Enter.

If the site shows an error or refuses the sign-in, press Enter anyway: that result is useful too.
Capturing to ${outFile}
`);
await page.goto(START, { waitUntil: "load" }).catch(() => {});
save();

const rl = readline.createInterface({ input: process.stdin });
rl.once("line", () => finish("enter", browser));
rl.once("close", () => finish("enter", browser));
