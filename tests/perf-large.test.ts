import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Five years of a busy household (~36k transactions on a bank, two cards) through the real routes, timed.
 * Opt-in because seeding takes a while: PENNY_PERF=1 npx vitest run tests/perf-large.test.ts
 */
const run = process.env.PENNY_PERF === "1";
const req = (url: string) => new Request(`http://127.0.0.1${url}`);
const timings: Record<string, number> = {};

describe.runIf(run)("five years of data", () => {
  beforeAll(async () => {
    process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-perf-"));
    // No network: FX rates and quotes fail fast and the routes fall back.
    globalThis.fetch = (async () => new Response("offline", { status: 503 })) as typeof fetch;
    const db = (await import("@/server/db")).getDb();
    const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
    const { saveBankCredentials } = await import("@/server/db/queries/bank-credentials");
    const { createSyncRun } = await import("@/server/db/queries/sync-runs");
    const { insertTransactions } = await import("@/server/db/queries/transactions");
    const { reconcileFlows } = await import("@/server/finance/pairing");
    const merchants = ["שופרסל", "רמי לוי", "וולט", "פז", "סופר-פארם", "ארומה", "נטפליקס", "חברת החשמל", "IKEA", "AMAZON", "קפה גרג", "מכבי", "הוט", "סלקום", "ויקטורי"];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const today = new Date();
    for (const [provider, account, perDay] of [["hapoalim", "12-111", 3], ["isracard", "4580", 9], ["max", "9921", 8]] as const) {
      const cred = saveBankCredentials(ws, provider, { username: "x" });
      const rows = [];
      for (let d = 0; d < 365 * 5; d++) {
        const day = new Date(today.getTime() - d * 86_400_000).toISOString().slice(0, 10);
        for (let i = 0; i < perDay * rnd() * 2; i++) {
          const amount = -Math.round(10 + rnd() * 400);
          rows.push({ accountNumber: account, date: `${day}T00:00:00.000Z`, processedDate: `${day}T00:00:00.000Z`, originalAmount: amount, originalCurrency: "ILS", chargedAmount: amount, description: merchants[Math.floor(rnd() * merchants.length)], type: "normal" as const, status: "completed" as const, identifier: `${provider}-${d}-${i}` });
        }
        if (provider === "hapoalim" && day.endsWith("-01")) rows.push({ accountNumber: account, date: `${day}T00:00:00.000Z`, processedDate: `${day}T00:00:00.000Z`, originalAmount: 18_000, originalCurrency: "ILS", chargedAmount: 18_000, description: "משכורת", type: "normal" as const, status: "completed" as const, identifier: `sal-${day}` });
      }
      const t0 = performance.now();
      insertTransactions(ws, rows, provider, cred, createSyncRun(ws, provider, cred, "2000-01-01"));
      timings[`insert ${provider} (${rows.length} rows)`] = performance.now() - t0;
    }
    const t0 = performance.now();
    reconcileFlows(ws);
    timings["reconcileFlows"] = performance.now() - t0;
    timings.rows = (db.prepare("SELECT COUNT(*) as n FROM transactions").get() as { n: number }).n;
  }, 300_000);

  it("answers the busy screens quickly", async () => {
    const routes: [string, () => Promise<{ GET: (r: Request) => Promise<Response> }>, string][] = [
      ["home", () => import("@/app/api/home/route"), "/api/home"],
      ["summary", () => import("@/app/api/summary/route"), "/api/summary"],
      ["overview", () => import("@/app/api/overview/route"), "/api/overview"],
      ["insights", () => import("@/app/api/insights/route"), "/api/insights"],
      ["suggestions", () => import("@/app/api/suggestions/route"), "/api/suggestions"],
      ["transactions", () => import("@/app/api/transactions/route"), "/api/transactions?limit=50"],
      ["transactions search", () => import("@/app/api/transactions/route"), "/api/transactions?search=%D7%95%D7%95%D7%9C%D7%98&limit=50"],
      ["budgets", () => import("@/app/api/budgets/route"), "/api/budgets"],
    ];
    for (const [name, load, url] of routes) {
      const { GET } = await load();
      await GET(req(url)); // first call warms statement caches
      const t0 = performance.now();
      const res = await GET(req(url));
      timings[name] = performance.now() - t0;
      expect(res.status, name).toBe(200);
    }
    if (process.env.PENNY_PERF_OUT) fs.writeFileSync(process.env.PENNY_PERF_OUT, JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])), null, 1));
    for (const [name] of routes) expect(timings[name], name).toBeLessThan(1500);
  }, 300_000);
});
