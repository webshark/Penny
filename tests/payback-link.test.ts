import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let db: ReturnType<typeof import("@/server/db/index").getDb>;
let paybacks: typeof import("@/server/db/queries/paybacks");
let txns: typeof import("@/server/db/queries/transactions");
let manual: typeof import("@/server/db/queries/manual-transactions");
let ws = 1;
let food = 0;

const range = (month: string) => [`${month}-01`, `${month}-31`] as const;

function add(kind: "expense" | "income", amount: number, date: string, description: string, businessSharePct = 0) {
  return manual.createManualTransaction(
    db,
    ws,
    { kind, amount, date, description, categoryId: kind === "expense" ? food : null, businessSharePct },
    [],
  );
}

const shareOf = (id: number) =>
  (db.prepare("SELECT business_share_pct AS share FROM transactions WHERE id = ?").get(id) as { share: number }).share;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-payback-"));
  db = (await import("@/server/db/index")).getDb();
  paybacks = await import("@/server/db/queries/paybacks");
  txns = await import("@/server/db/queries/transactions");
  manual = await import("@/server/db/queries/manual-transactions");
  const { ensureCategory } = await import("@/server/db/queries/categories");
  ws = (db.prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as { id: number }).id;
  ensureCategory(ws, "אוכל", undefined, "expense");
  food = (db.prepare("SELECT id FROM categories WHERE workspace_id = ? AND name = 'אוכל'").get(ws) as { id: number }).id;
});

describe("payback links", () => {
  it("turns a Bit credit into an offset for the expense it repays", () => {
    const dinner = add("expense", 300, "2026-11-10", "ארוחה");
    const bit = add("income", 150, "2026-11-11", "ביט מדנה");
    const [from, to] = range("2026-11");

    expect(txns.getPeriodTotal(ws, from, to)).toBe(300);
    expect(txns.getTransactionsSummary(ws, from, to).income.total).toBe(150);

    expect(paybacks.linkPayback(ws, bit, dinner)).toEqual({ ok: true });

    expect(txns.getPeriodTotal(ws, from, to)).toBe(150);
    const summary = txns.getTransactionsSummary(ws, from, to);
    expect(summary.income.total).toBe(0);
    expect(summary.expense.total).toBe(150);
    const breakdown = txns.getCategoryBreakdown(ws, from, to);
    expect(breakdown.find((b) => b.categoryId === food)?.amount).toBe(150);
  });

  it("lets two credits cover one expense but never more than it costs", () => {
    const dinner = add("expense", 600, "2026-12-05", "ארוחה גדולה");
    const first = add("income", 200, "2026-12-06", "ביט דנה");
    const second = add("income", 400, "2026-12-07", "ביט יוסי");
    const third = add("income", 100, "2026-12-08", "ביט נוסף");
    const [from, to] = range("2026-12");

    expect(paybacks.linkPayback(ws, first, dinner)).toEqual({ ok: true });
    expect(paybacks.linkPayback(ws, second, dinner)).toEqual({ ok: true });
    expect(paybacks.linkPayback(ws, third, dinner)).toEqual({ ok: false, code: "too-large" });
    expect(txns.getPeriodTotal(ws, from, to)).toBe(0);

    expect(paybacks.getPaybackState(ws, dinner)?.coveredAbs).toBe(600);
    expect(paybacks.unlinkPayback(ws, second)).toBe(true);
    expect(txns.getPeriodTotal(ws, from, to)).toBe(400);
    // The refused third credit was never linked, so it still counts as income alongside the unlinked one.
    expect(txns.getTransactionsSummary(ws, from, to).income.total).toBe(500);
    expect(paybacks.getPaybackState(ws, dinner)?.links).toHaveLength(1);
  });

  it("carries the expense's business share onto the credit and gives its own back on unlink", () => {
    const dinner = add("expense", 400, "2026-10-06", "ארוחת עסקים", 50);
    const bit = add("income", 200, "2026-10-07", "ביט", 100);
    const [from, to] = range("2026-10");

    // Half of the dinner is business, so the personal expense is 200 before the payback.
    expect(txns.getPeriodTotal(ws, from, to)).toBe(200);

    expect(paybacks.linkPayback(ws, bit, dinner)).toEqual({ ok: true });
    expect(shareOf(bit)).toBe(50);
    // The credit now nets 100 personal against the 200 personal expense it repays.
    expect(txns.getPeriodTotal(ws, from, to)).toBe(100);

    expect(paybacks.unlinkPayback(ws, bit)).toBe(true);
    expect(shareOf(bit)).toBe(100);
    expect(txns.getPeriodTotal(ws, from, to)).toBe(200);
  });

  it("moves linked credits when the expense's business share is edited", () => {
    const dinner = add("expense", 500, "2026-07-06", "ציוד משרדי");
    const bit = add("income", 200, "2026-07-07", "ביט");
    const [from, to] = range("2026-07");

    expect(paybacks.linkPayback(ws, bit, dinner)).toEqual({ ok: true });
    expect(txns.getPeriodTotal(ws, from, to)).toBe(300);

    // All of it becomes business, so the credit has to follow or 200 stays as personal spending.
    manual.updateTransactionFields(db, ws, dinner, { businessSharePct: 100 }, []);
    expect(shareOf(bit)).toBe(100);
    expect(txns.getPeriodTotal(ws, from, to)).toBe(0);

    manual.updateTransactionFields(db, ws, dinner, { businessSharePct: 40 }, []);
    expect(shareOf(bit)).toBe(40);
    // 300 personal left on the expense, 120 on the credit.
    expect(txns.getPeriodTotal(ws, from, to)).toBe(180);

    // Unlinking still gives the credit its own share back, not the expense's last one.
    expect(paybacks.unlinkPayback(ws, bit)).toBe(true);
    expect(shareOf(bit)).toBe(0);
    expect(txns.getPeriodTotal(ws, from, to)).toBe(300);
  });

  it("keeps a fully business expense and its payback out of the personal totals", () => {
    const software = add("expense", 300, "2026-09-02", "תוכנה", 100);
    const bit = add("income", 300, "2026-09-03", "החזר חברה");
    const [from, to] = range("2026-09");

    expect(paybacks.linkPayback(ws, bit, software)).toEqual({ ok: true });
    expect(shareOf(bit)).toBe(100);
    expect(txns.getPeriodTotal(ws, from, to)).toBe(0);
    expect(txns.getTransactionsSummary(ws, from, to).income.total).toBe(0);

    // Deleting the expense gives the credit its own share back too, not just its kind.
    manual.deleteManualTransaction(db, ws, software);
    expect(shareOf(bit)).toBe(0);
  });

  it("gives the credit its own kind and category back when the expense is deleted", () => {
    const dinner = add("expense", 900, "2027-01-09", "מסעדה");
    const bit = add("income", 900, "2027-01-10", "ביט");

    expect(paybacks.linkPayback(ws, dinner, bit)).toEqual({ ok: true });
    manual.deleteManualTransaction(db, ws, dinner);

    const row = db.prepare("SELECT kind, category_id AS categoryId FROM transactions WHERE id = ?").get(bit) as {
      kind: string;
      categoryId: number | null;
    };
    expect(row).toEqual({ kind: "income", categoryId: null });
    expect(paybacks.getPaybackState(ws, bit)?.links).toEqual([]);
  });

  it("suggests nearby opposite rows and stops suggesting a credit once it is linked", () => {
    const dinner = add("expense", 220, "2027-02-03", "פיצה");
    const bit = add("income", 200, "2027-02-04", "ביט");

    const suggested = paybacks.getPaybackState(ws, bit)?.candidates ?? [];
    expect(suggested.map((c) => c.id)).toContain(dinner);

    expect(paybacks.linkPayback(ws, bit, dinner)).toEqual({ ok: true });
    const other = add("expense", 220, "2027-02-05", "עוד פיצה");
    expect((paybacks.getPaybackState(ws, other)?.candidates ?? []).map((c) => c.id)).not.toContain(bit);
  });
});
