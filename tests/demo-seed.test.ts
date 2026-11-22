import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { ensureDemoData } from "@/server/demo/seed";

const connections: Database.Database[] = [];
function fixture() {
  const db = new Database(":memory:");
  connections.push(db);
  for (const file of readdirSync("src/server/db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(`src/server/db/migrations/${file}`, "utf8"));
  }
  db.pragma("foreign_keys = ON");
  // migrate.ts adds these two columns in code (049), so the SQL files alone don't have them.
  const goalColumns = new Set((db.pragma("table_info(goals)") as { name: string }[]).map((c) => c.name));
  if (!goalColumns.has("kind")) db.exec("ALTER TABLE goals ADD COLUMN kind TEXT NOT NULL DEFAULT 'general'");
  if (!goalColumns.has("details")) db.exec("ALTER TABLE goals ADD COLUMN details TEXT");
  return db;
}

const count = (db: Database.Database, sql: string, ...args: unknown[]) =>
  (db.prepare(sql).get(...args) as { n: number }).n;

const withDemo = (on: boolean) => {
  if (on) process.env.PENNY_DEMO = "1";
  else delete process.env.PENNY_DEMO;
};

afterEach(() => {
  connections.splice(0).forEach((db) => db.close());
  delete process.env.PENNY_DEMO;
});

describe("demo household", () => {
  it("is not written unless demo mode is on", () => {
    const db = fixture();
    withDemo(false);
    expect(ensureDemoData(db)).toBe(false);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions")).toBe(0);
  });

  it("builds a household with bank and card history, budgets, plans, insurance and assets", () => {
    const db = fixture();
    withDemo(true);
    expect(ensureDemoData(db)).toBe(true);

    expect(count(db, "SELECT COUNT(*) AS n FROM transactions")).toBeGreaterThan(60);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE kind = 'income' AND charged_amount > 0")).toBeGreaterThan(8);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE kind = 'expense' AND charged_amount < 0")).toBeGreaterThan(30);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE kind = 'transfer'")).toBeGreaterThan(6);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE status = 'pending'")).toBe(1);
    // Purchases abroad keep their original currency next to the shekel amount.
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE original_currency IN ('USD','EUR') AND charged_currency = 'ILS'")).toBeGreaterThan(0);

    // Both banks carry a balance, which is what the per-account forecast reads.
    expect(count(db, "SELECT COUNT(*) AS n FROM account_balances WHERE provider IN ('hapoalim','leumi')")).toBe(2);
    // Every profile opens Trackers with the same three examples.
    expect(count(db, "SELECT COUNT(*) AS n FROM synced_preferences WHERE key = 'trackers'")).toBe(count(db, "SELECT COUNT(*) AS n FROM profiles"));
    // Card statements leave the bank as transfers, never as fresh spending.
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE kind = 'transfer' AND description IN ('ישראכט','מקס איט פיננסים')")).toBeGreaterThan(0);

    // Every category on a seeded row is a leaf: the edit sheet rejects parent categories.
    expect(count(db, `SELECT COUNT(*) AS n FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.category_id IS NOT NULL AND c.id IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)`)).toBe(0);

    expect(count(db, "SELECT COUNT(*) AS n FROM budgets")).toBeGreaterThan(10);
    expect(count(db, "SELECT COUNT(*) AS n FROM planned_items")).toBe(3);
    expect(count(db, "SELECT COUNT(*) AS n FROM insurance_policies")).toBe(5); // home, life, car and two overlapping health policies
    expect(count(db, "SELECT COUNT(*) AS n FROM goals")).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM assets")).toBe(7);
    expect(count(db, "SELECT COUNT(*) AS n FROM asset_snapshots")).toBeGreaterThan(30);
    expect(count(db, "SELECT COUNT(*) AS n FROM transaction_tags")).toBe(2);

    expect(count(db, "SELECT COUNT(*) AS n FROM profiles WHERE name IN ('דנה','יואב')")).toBe(2);
    const onboarding = db.prepare("SELECT value FROM settings WHERE key = 'onboarding_step'").get() as { value: string };
    expect(onboarding.value).toBe("complete");
    const owners = JSON.parse((db.prepare("SELECT value FROM workspace_settings WHERE key = 'account_owners'").get() as { value: string }).value);
    expect(owners["0001"]).toBe("dana");
  });

  it("seeds the connections the settings screens read, linked to their own rows", () => {
    const db = fixture();
    withDemo(true);
    ensureDemoData(db);

    // Every lane has a connection: two banks, two cards, and open banking.
    const providers = (db.prepare("SELECT provider FROM bank_credentials ORDER BY provider").all() as { provider: string }[]).map((r) => r.provider);
    expect(providers).toEqual(["hapoalim", "isracard", "leumi", "max", "openBanking"]);
    expect(count(db, "SELECT COUNT(*) AS n FROM bank_credentials WHERE label <> ''")).toBe(5);

    // Synced rows point at the connection that brought them in, except cash (manual).
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE provider <> 'cash' AND credential_id IS NULL")).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE provider = 'cash' AND credential_id IS NOT NULL")).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM transactions t
      JOIN bank_credentials c ON c.id = t.credential_id WHERE c.provider = t.provider`))
      .toBe(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE provider <> 'cash'"));

    // Without this link the bank tiles show zero transactions and no last sync. Cash has no connection.
    expect(count(db, "SELECT COUNT(*) AS n FROM sync_runs WHERE credential_id IS NULL AND provider <> 'cash'")).toBe(0);
    const hapoalim = db.prepare("SELECT id FROM bank_credentials WHERE provider = 'hapoalim'").get() as { id: number };
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions WHERE credential_id = ?", hapoalim.id)).toBeGreaterThan(10);

    // Investment houses read pension_connections; three houses are wired to a scraper.
    expect(count(db, "SELECT COUNT(*) AS n FROM pension_connections WHERE last_sync_at IS NOT NULL")).toBe(3);
    const funds = (db.prepare("SELECT fund_id AS id FROM pension_connections ORDER BY fund_id").all() as { id: string }[]).map((r) => r.id);
    expect(funds).toEqual(["harel", "meitav", "migdal"]);
  });

  it("keeps the real charge and leaves the business share out of the personal part", () => {
    const db = fixture();
    withDemo(true);
    ensureDemoData(db);
    const business = db.prepare("SELECT charged_amount, personal_amount FROM transactions WHERE business_share_pct = 100 AND description = 'Adobe Creative Cloud'").get() as
      | { charged_amount: number; personal_amount: number }
      | undefined;
    expect(business?.charged_amount).toBeLessThan(0);
    expect(business?.personal_amount).toBe(0);
  });

  it("seeds once, even if called again", () => {
    const db = fixture();
    withDemo(true);
    expect(ensureDemoData(db)).toBe(true);
    const before = count(db, "SELECT COUNT(*) AS n FROM transactions");
    expect(ensureDemoData(db)).toBe(false);
    expect(count(db, "SELECT COUNT(*) AS n FROM transactions")).toBe(before);
  });
});
