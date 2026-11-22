import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// Regressions found in a manual QA pass against a running server.
let db: ReturnType<typeof import("@/server/db/index").getDb>;
let q: typeof import("@/server/db/queries/transactions");
let ws: number;

const insert = (description: string, charged: number, kind: string, date = "2026-11-05") =>
  db
    .prepare(
      `INSERT INTO transactions (workspace_id, account_number, date, processed_date, original_amount,
         original_currency, charged_amount, charged_currency, description, type, status, provider,
         sync_run_id, dedup_hash, kind, is_excluded)
       VALUES (?, 'cash', ?, ?, ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed', 'cash', 1, ?, ?, 0)`
    )
    .run(ws, date, date, charged, charged, description, `${description}-${charged}-${date}`, kind)
    .lastInsertRowid as number;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-qa-"));
  db = (await import("@/server/db/index")).getDb();
  q = await import("@/server/db/queries/transactions");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  db.prepare(
    "INSERT OR IGNORE INTO sync_runs (id, workspace_id, provider, started_at, completed_at, status, scrape_from_date) VALUES (1, ?, 'cash', '1970-01-01', '1970-01-01', 'completed', '1970-01-01')"
  ).run(ws);

  insert("Supermarket", -100, "expense");
  insert("Card refund", 30, "expense");
  insert("Salary", 5000, "income");
  insert("50% off_coupon", -20, "expense");
  insert("plain", -10, "expense");
});

describe("transaction list QA regressions", () => {
  it("filters expenses by kind, so a card refund is not listed as income", () => {
    const expenses = q.queryTransactions(ws, { kind: "expense", limit: 100 });
    const incomes = q.queryTransactions(ws, { kind: "income", limit: 100 });

    expect(expenses.transactions.map((t) => t.description)).toContain("Card refund");
    expect(incomes.transactions.map((t) => t.description)).not.toContain("Card refund");
    expect(incomes.transactions.map((t) => t.description)).toEqual(["Salary"]);
  });

  it("treats % and _ in search as literal characters", () => {
    // Literal % and _ exist in one merchant name and must not match everything else.
    expect(q.queryTransactions(ws, { search: "%", limit: 100 }).transactions.map((t) => t.description)).toEqual([
      "50% off_coupon",
    ]);
    expect(q.queryTransactions(ws, { search: "_", limit: 100 }).transactions.map((t) => t.description)).toEqual([
      "50% off_coupon",
    ]);
    expect(q.queryTransactions(ws, { search: "50%", limit: 100 }).transactions.map((t) => t.description)).toEqual([
      "50% off_coupon",
    ]);
    expect(q.queryTransactions(ws, { search: "off_c", limit: 100 }).transactions.map((t) => t.description)).toEqual([
      "50% off_coupon",
    ]);
  });

  it("keeps excluded rows out of the review inbox", () => {
    const id = insert("Hidden but uncategorized", -40, "expense", "2026-11-07");
    db.prepare("UPDATE transactions SET is_excluded = 1 WHERE id = ?").run(id);

    const inbox = q.queryTransactions(ws, { needsReview: true, limit: 100 }).transactions;
    expect(inbox.map((t) => t.description)).not.toContain("Hidden but uncategorized");
    expect(inbox.map((t) => t.description)).toContain("Supermarket");
  });

  it("survives a NaN or negative limit instead of throwing", () => {
    expect(() => q.queryTransactions(ws, { limit: Number.NaN, offset: Number.NaN })).not.toThrow();
    expect(q.queryTransactions(ws, { limit: 100 }).transactions).toHaveLength(6);
    expect(q.queryTransactions(ws, { limit: Number.NaN }).transactions).toHaveLength(6);
    expect(q.queryTransactions(ws, { limit: -5, offset: -5 }).transactions).toHaveLength(1);
    expect(q.queryTransactions(ws, { limit: 99999 }).transactions.length).toBeLessThanOrEqual(200);
  });
});

describe("uncategorized spending on the budget screen", () => {
  it("reports uncategorized expense spend separately so it can be shown", () => {
    db.prepare(
      `INSERT INTO transactions (workspace_id, account_number, date, processed_date, original_amount, original_currency,
         charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash, kind, is_excluded)
       VALUES (?, 'cash', '2026-11-08', '2026-11-08', -77, 'ILS', -77, 'ILS', 'No category yet', 'normal', 'completed', 'cash', 1, 'uncat-1', 'expense', 0)`
    ).run(ws);
    db.prepare("UPDATE transactions SET category_id = NULL WHERE description = 'No category yet'").run();

    const spend = q.getUncategorizedSpend(ws, "2026-11-01", "2026-11-30");
    expect(spend.count).toBeGreaterThanOrEqual(1);
    expect(spend.spent).toBeGreaterThanOrEqual(77);
    // The excluded row and the income rows must stay out of it.
    expect(q.getUncategorizedSpend(ws, "2026-12-01", "2026-12-31")).toEqual({ spent: 0, count: 0 });
  });
});

describe("money rounding", () => {
  it("rounds half a cent up instead of losing it to float drift", async () => {
    const { roundCents } = await import("@/lib/money");
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(-1.005)).toBe(-1.01);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(2363.285)).toBe(2363.29);
    expect(roundCents(0)).toBe(0);
    expect(roundCents(Number.NaN)).toBe(0);
  });
});

describe("summary route params", () => {
  it("falls back to this month for broken dates and clamps months", async () => {
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(new Request("http://127.0.0.1/api/summary?from=abc&to=zzz&months=abc"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.monthLabel).not.toContain("Invalid");
    expect(body.periodTotal).toBe(177); // 100 - 30 + 20 + 10 categorized/unmatched, plus the 77 uncategorized row
    expect(body.monthLabel).toBe(
      new Date().toLocaleDateString("en-US", { month: "long" })
    );
  });

  it("sorts a reversed range instead of returning nothing", async () => {
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(new Request("http://127.0.0.1/api/summary?from=2026-11-30&to=2026-11-01"));
    expect((await res.json()).periodTotal).toBe(177);
  });
});

describe("settings PUT validation", () => {
  const put = async (body: Record<string, unknown>) => {
    const { PUT } = await import("@/app/api/settings/route");
    return PUT(new Request("http://127.0.0.1/api/settings", { method: "PUT", body: JSON.stringify(body) }));
  };

  it("rejects a non-numeric monthlyTarget instead of wiping it", async () => {
    const ok = await put({ monthlyTarget: 4200 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).monthlyTarget).toBe(4200);

    const bad = await put({ monthlyTarget: "abc" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toContain("monthlyTarget");

    const { getAppSettings } = await import("@/server/db/queries/settings");
    expect(getAppSettings(ws).monthlyTarget).toBe(4200); // the stored target survived
    expect((await (await put({ monthlyTarget: null })).json()).monthlyTarget).toBeNull(); // explicit clear still works
  });

  it("rejects broken paydayDay and monthsToSync values", async () => {
    expect((await put({ paydayDay: "abc" })).status).toBe(400);
    expect((await put({ paydayDay: 10 })).status).toBe(200);
    expect((await put({ monthsToSync: "6" })).status).toBe(400);
    expect((await put({ monthsToSync: 99 })).status).toBe(400);
    expect((await put({ monthsToSync: 6 })).status).toBe(200);
  });
});
