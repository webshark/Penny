import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { createManualTransaction, deleteManualTransaction, updateTransactionFields } from "@/server/db/queries/manual-transactions";

const connections: Database.Database[] = [];
function fixture() {
  const db = new Database(":memory:"); connections.push(db);
  for (const file of readdirSync("src/server/db/migrations").filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(`src/server/db/migrations/${file}`, "utf8"));
  db.pragma("foreign_keys = ON");
  const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const leaf = (kind: string) => (db.prepare("SELECT id FROM categories WHERE workspace_id=? AND kind=? AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL) LIMIT 1").get(ws, kind) as { id: number }).id;
  const sync = Number(db.prepare("INSERT INTO sync_runs (workspace_id,provider,status,scrape_from_date,started_at) VALUES (?,'hapoalim','completed','2026-01-01','2026-11-01')").run(ws).lastInsertRowid);
  db.prepare("INSERT INTO transactions (id,workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind) VALUES (1,?,'123','2026-11-01','2026-11-01',-100,'ILS',-100,'Bank row','normal','completed','hapoalim',?,'h1','expense')").run(ws, sync);
  const get = (id: number) => db.prepare("SELECT * FROM transactions WHERE id=?").get(id) as Record<string, unknown> | undefined;
  return { db, ws, expense: leaf("expense"), income: leaf("income"), get };
}
afterEach(() => { connections.splice(0).forEach(db => db.close()); });
const base = { kind: "expense", amount: 42.5, date: "2026-11-10", description: "Coffee" };

describe("manual transactions", () => {
  it("creates a signed manual row with category, tags and account", () => {
    const { db, ws, expense, income, get } = fixture();
    const id = createManualTransaction(db, ws, { ...base, categoryId: expense, tags: ["trip", "trip"], memo: "x" }, []);
    expect(get(id)).toMatchObject({ provider: "cash", charged_amount: -42.5, kind: "expense", category_id: expense, category_source: "user", account_number: "cash" });
    expect(db.prepare("SELECT COUNT(*) n FROM transaction_tags WHERE transaction_id=?").get(id)).toEqual({ n: 1 });
    const inc = createManualTransaction(db, ws, { kind: "income", amount: 1000, date: "2026-11-01", description: "Gift", categoryId: income, account: "123" }, []);
    expect(get(inc)).toMatchObject({ provider: "manual", charged_amount: 1000, account_number: "123" });
  });
  it("rejects bad input", () => {
    const { db, ws, expense, income } = fixture();
    for (const bad of [{ ...base, amount: 0 }, { ...base, amount: -5 }, { ...base, amount: 1e8 }, { ...base, amount: "5" }, { ...base, date: "2026-02-30" }, { ...base, date: "1980-01-01" },
      { ...base, description: "  " }, { ...base, kind: "transfer" }, { ...base, categoryId: income }, { ...base, categoryId: 999999 }, { ...base, account: "nope" }, { ...base, owner: "ghost" }, { amount: 5 }, null, []])
      expect(() => createManualTransaction(db, ws, bad as never, []), JSON.stringify(bad)).toThrow();
    expect(() => createManualTransaction(db, ws, { ...base, categoryId: expense }, [])).not.toThrow();
  });
  it("edits every field of a manual row; switching type clears the category", () => {
    const { db, ws, expense, get } = fixture();
    const id = createManualTransaction(db, ws, { ...base, categoryId: expense }, []);
    updateTransactionFields(db, ws, id, { amount: 10, date: "2026-11-02", description: "Tea" }, []);
    expect(get(id)).toMatchObject({ charged_amount: -10, date: "2026-11-02", description: "Tea", category_id: expense });
    updateTransactionFields(db, ws, id, { kind: "income" }, []);
    expect(get(id)).toMatchObject({ charged_amount: 10, kind: "income", category_id: null });
  });
  it("bank rows: display fields only, never deleted", () => {
    const { db, ws, expense, get } = fixture();
    updateTransactionFields(db, ws, 1, { description: "Nicer name", memo: "note", categoryId: expense, excluded: true }, []);
    expect(get(1)).toMatchObject({ description: "Nicer name", memo: "note", category_id: expense, is_excluded: 1, charged_amount: -100 });
    for (const body of [{ amount: 5 }, { date: "2026-11-02" }, { kind: "income" }, { account: "cash" }])
      expect(() => updateTransactionFields(db, ws, 1, body, []), JSON.stringify(body)).toThrow(/bank/);
    expect(() => deleteManualTransaction(db, ws, 1)).toThrow(/hide/);
    expect(get(1)).toBeDefined();
  });
  it("delete returns a snapshot that re-creates the row (undo), scoped to the workspace", () => {
    const { db, ws, expense, get } = fixture();
    const id = createManualTransaction(db, ws, { ...base, categoryId: expense, tags: ["a"], businessSharePct: 25 }, []);
    expect(() => deleteManualTransaction(db, ws + 100, id)).toThrow(/not found/);
    const snap = deleteManualTransaction(db, ws, id);
    expect(get(id)).toBeUndefined();
    const again = createManualTransaction(db, ws, snap, []);
    expect(get(again)).toMatchObject({ charged_amount: -42.5, description: "Coffee", category_id: expense, date: "2026-11-10", business_share_pct: 25 });
  });
  it("keeps the real charge and derives the personal part from a business share", () => {
    const { db, ws, expense, get } = fixture();
    const id = createManualTransaction(db, ws, { ...base, categoryId: expense, businessSharePct: 40 }, []);
    expect(get(id)).toMatchObject({ charged_amount: -42.5, business_share_pct: 40, personal_amount: -25.5 });
    // A bank row keeps its amount; the user only tags the business part.
    updateTransactionFields(db, ws, 1, { businessSharePct: 50 }, []);
    expect(get(1)).toMatchObject({ charged_amount: -100, business_share_pct: 50, personal_amount: -50 });
    updateTransactionFields(db, ws, 1, { businessSharePct: 0 }, []);
    expect(get(1)).toMatchObject({ personal_amount: -100 });
  });
  it("rejects a business share that is not a whole percent in range", () => {
    const { db, ws, get } = fixture();
    for (const businessSharePct of [-1, 101, 12.5, "20", null])
      expect(() => updateTransactionFields(db, ws, 1, { businessSharePct }, []), String(businessSharePct)).toThrow(/business/);
    expect(get(1)).toMatchObject({ business_share_pct: 0 });
  });
});
