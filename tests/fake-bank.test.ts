import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ScrapeResult, ScrapedTransaction } from "@/server/scrapers/types";

/**
 * A fake bank and card company behind the real sync pipeline (orchestrator → dedup → pending replacement →
 * balances and balance check → flow pairing → Telegram alerts). The fake returns exactly what the scrapers return:
 * dates as UTC instants of Israeli midnight, installments, foreign currency, a pending charge that later completes
 * under a new identifier, overlapping windows on every sync, and a bot block. Five syncs over a week of December.
 */

const bank = vi.hoisted(() => ({
  leumi: null as null | ScrapeResult,
  max: null as null | ScrapeResult,
}));
const sent = vi.hoisted(() => [] as string[]);

vi.mock("@/server/scrapers", () => ({
  scrapeBank: async (_ws: number, provider: string) => {
    const r = bank[provider as "leumi" | "max"];
    if (!r) throw new Error(`fake bank has no ${provider}`);
    return structuredClone(r);
  },
}));
vi.mock("@/server/bot/config", async (orig) => ({
  ...(await orig<typeof import("@/server/bot/config")>()),
  getBotConfig: () => ({ token: "fake", chatId: 42, username: null, code: null }),
  getHideAmounts: () => false,
}));

/** Israeli midnight of `day` (December: UTC+2) as the scrapers send it. */
const at = (day: string) => new Date(`${day}T00:00:00+02:00`).toISOString();
const tx = (day: string, description: string, amount: number, extra: Partial<ScrapedTransaction> = {}): ScrapedTransaction => ({
  type: "normal", identifier: `${description}-${day}`, date: at(day), processedDate: at(day),
  originalAmount: amount, originalCurrency: "ILS", chargedAmount: amount, description, status: "completed", ...extra,
});
const ok = (accounts: ScrapeResult["accounts"]): ScrapeResult => ({ success: true, accounts });

// The bank account, as it grows over the week.
const salary = tx("2026-12-01", "משכורת", 15_000);
const cardBill = tx("2026-12-02", "מקס איט פיננסים", -3_200);
const rent = tx("2026-12-02", "שכר דירה", -5_000);
const electricity = tx("2026-12-04", "חברת החשמל", -400);
const water = tx("2026-12-06", "תאגיד המים", -150);
// The card: last month's groceries, an installment, a purchase in dollars, and a delivery that is pending first.
const groceries = tx("2026-11-28", "שופרסל דיל", -450);
const installment = tx("2026-10-15", "KSP", -300, { type: "installments", originalAmount: -900, processedDate: at("2026-12-02"), installments: { number: 2, total: 3 } });
const amazon = tx("2026-12-02", "AMAZON MKTPLACE", -190, { originalAmount: -50, originalCurrency: "USD" });
const woltPending = tx("2026-12-03", "וולט", -120, { status: "pending", identifier: undefined });
const woltDone = tx("2026-12-03", "וולט", -120, { identifier: "W-99812", processedDate: at("2026-12-05") });
const pharm = tx("2026-12-04", "סופר-פארם", -80);

let ws: number;
let db: import("better-sqlite3").Database;
let sync: (now: string) => Promise<void>;
let lastRun = 0;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-fakebank-"));
  vi.useFakeTimers({ toFake: ["Date"] });
  db = (await import("@/server/db")).getDb();
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const { saveBankCredentials } = await import("@/server/db/queries/bank-credentials");
  saveBankCredentials(ws, "leumi", { username: "fake", password: "fake" });
  saveBankCredentials(ws, "max", { username: "fake", password: "fake" });
  const { runAllWorkspaces } = await import("@/server/sync/orchestrator");
  await import("@/server/bot/index"); // loaded up front, so the sync's Telegram step isn't slowed by a first import
  // A Telegram bot that records what it would send.
  globalThis.__pennyBot = { api: { sendMessage: async (_chat: number, text: string) => { sent.push(text); } } } as never;
  sync = async (now: string) => {
    vi.setSystemTime(new Date(now));
    await runAllWorkspaces(undefined, undefined, "scheduled");
    await new Promise((r) => setTimeout(r, 300)); // Telegram feedback runs after the sync returns
    // SQLite's own clock isn't faked: stamp the balances with the simulated time, as a real sync would.
    const stamp = now.replace("T", " ").slice(0, 19);
    db.prepare("UPDATE account_balances SET updated_at = ?").run(stamp);
    db.prepare("UPDATE sync_runs SET started_at = ?, completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE ? END WHERE id > ?").run(stamp, stamp, lastRun);
    lastRun = (db.prepare("SELECT COALESCE(MAX(id), 0) as id FROM sync_runs").get() as { id: number }).id;
  };
});

afterAll(() => {
  vi.useRealTimers();
  globalThis.__pennyBot = undefined;
});

const count = () => (db.prepare("SELECT COUNT(*) as n FROM transactions WHERE workspace_id = ?").get(ws) as { n: number }).n;
const health = async () => (await import("@/server/db/queries/home")).getBankHealth(ws);

describe("fake bank, a week of syncs", () => {
  it("day 1: stores Israeli days, keeps the card bill out of spending, keeps the pending charge", async () => {
    bank.leumi = ok([{ accountNumber: "12-345-678", balance: 20_000, transactions: [salary, cardBill, rent] }]);
    bank.max = ok([{ accountNumber: "4580", transactions: [groceries, installment, amazon, woltPending] }]);
    await sync("2026-12-03T08:00:00Z");

    expect(count()).toBe(7);
    const dates = db.prepare("SELECT DISTINCT date FROM transactions").all().map((r) => (r as { date: string }).date);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect((db.prepare("SELECT date FROM transactions WHERE description = 'משכורת'").get() as { date: string }).date).toBe("2026-12-01");
    expect((db.prepare("SELECT kind FROM transactions WHERE description = 'מקס איט פיננסים'").get() as { kind: string }).kind).toBe("transfer");
    // No AI here: the merchant dictionary still categorizes known names.
    const cat = (d: string) => (db.prepare("SELECT c.name FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.description = ?").get(d) as { name: string | null }).name;
    expect(cat("שופרסל דיל")).toBe("Groceries");
    expect(cat("שכר דירה")).toBe("Rent");
    expect(cat("KSP")).toBe("Electronics");

    const { cashBetween } = await import("@/server/finance/facts");
    const dec = cashBetween(ws, "2026-12-01", "2026-12-31");
    expect(dec.income).toBe(15_000);
    // Rent and the dollar purchase; the card bill is the card's charges again, the pending delivery isn't final.
    expect(dec.spend).toBe(5_190);
    expect(cashBetween(ws, "2026-11-01", "2026-11-30").spend).toBe(450);
  });

  it("day 3: overlapping windows add nothing twice, the pending charge becomes one completed row, the balance checks out", async () => {
    bank.leumi = ok([{ accountNumber: "12-345-678", balance: 19_600, transactions: [salary, cardBill, rent, electricity] }]);
    bank.max = ok([{ accountNumber: "4580", transactions: [groceries, installment, amazon, woltDone, pharm] }]);
    await sync("2026-12-05T08:00:00Z");

    expect(count()).toBe(9);
    expect(db.prepare("SELECT COUNT(*) as n FROM transactions WHERE status = 'pending'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) as n FROM transactions WHERE description = 'וולט'").get()).toEqual({ n: 1 });
    expect((await health()).find((h) => h.provider === "leumi")?.drift ?? null).toBeNull(); // 20,000 − 400 = 19,600

    const { cashBetween } = await import("@/server/finance/facts");
    expect(cashBetween(ws, "2026-12-01", "2026-12-31").spend).toBe(5_790);
  });

  it("day 5: a transaction the bank charged but didn't list shows as a balance gap", async () => {
    // 19,600 − 150 water − 300 that never appears in the list.
    bank.leumi = ok([{ accountNumber: "12-345-678", balance: 19_150, transactions: [salary, cardBill, rent, electricity, water] }]);
    await sync("2026-12-07T08:00:00Z");
    expect((await health()).find((h) => h.provider === "leumi")?.drift).toBe(-300);
    expect(count()).toBe(10);
  });

  it("day 6: the bank blocks the sync; the card still syncs and Telegram says why, once", async () => {
    const { SYNC_ERRORS } = await import("@/lib/sync-errors");
    bank.leumi = { success: false, accounts: [], errorMessage: SYNC_ERRORS.botBlocked };
    sent.length = 0;
    await sync("2026-12-08T08:00:00Z");
    await vi.waitFor(() => expect(sent.filter((m) => m.includes("הסנכרון של"))).toHaveLength(1), { timeout: 5_000 });
    const alerts = sent.filter((m) => m.includes("הסנכרון של"));
    expect(alerts[0]).toContain("נכשל");
    expect((await health()).find((h) => h.provider === "leumi")?.status).toBe("error");
    expect((await health()).find((h) => h.provider === "max")?.status).toBe("ok");

    // Still blocked the next run: no second alert.
    sent.length = 0;
    await sync("2026-12-08T14:00:00Z");
    expect(sent.filter((m) => m.includes("הסנכרון של"))).toHaveLength(0);
  });

  it("day 7: the bank is back; Telegram says so and nothing was lost or doubled", async () => {
    bank.leumi = ok([{ accountNumber: "12-345-678", balance: 19_150, transactions: [salary, cardBill, rent, electricity, water] }]);
    sent.length = 0;
    await sync("2026-12-09T08:00:00Z");
    await vi.waitFor(() => expect(sent.some((m) => m.includes("מסתנכרן שוב"))).toBe(true), { timeout: 5_000 });
    expect(count()).toBe(10);
    expect(db.prepare("SELECT COUNT(*) as n FROM sync_runs WHERE status = 'running'").get()).toEqual({ n: 0 });
    const { cashBetween } = await import("@/server/finance/facts");
    const dec = cashBetween(ws, "2026-12-01", "2026-12-31");
    expect(dec).toEqual({ income: 15_000, spend: 5_940, net: 9_060 });
  });

  it("migration 075 fixes Max bills stored before Max was recognised", () => {
    const run = (db.prepare("SELECT MAX(id) as id FROM sync_runs").get() as { id: number }).id;
    const id = Number(db.prepare(`INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind)
      VALUES (?,'12-345-678','2026-11-02','2026-11-02',-2900,'ILS',-2900,'מקס איט פיננסים','normal','completed','leumi',?,'old-max','expense')`).run(ws, run).lastInsertRowid);
    db.exec(fs.readFileSync("src/server/db/migrations/075_max_card_bills.sql", "utf8"));
    expect(db.prepare("SELECT kind, flow_type FROM transactions WHERE id = ?").get(id)).toEqual({ kind: "transfer", flow_type: "transfer_internal" });
  });
});
