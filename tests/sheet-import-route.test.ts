import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let POST: typeof import("@/app/api/import/sheet/route").POST;
let DELETE: typeof import("@/app/api/import/sheet/route").DELETE;
let GET: typeof import("@/app/api/import/sheet/route").GET;
let getDb: typeof import("@/server/db/index").getDb;
let ensureCategory: typeof import("@/server/db/queries/categories").ensureCategory;
let ws = 1;

const post = (body: unknown) =>
  new Request("http://127.0.0.1/api/import/sheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const row = (over: Record<string, unknown> = {}) => ({
  date: "2024-02-01",
  description: "קפה",
  amount: 12.5,
  kind: "expense",
  account: "cash",
  category: "",
  tags: [],
  owner: null,
  businessSharePct: 0,
  memo: null,
  ...over,
});

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-sheet-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ ensureCategory } = await import("@/server/db/queries/categories"));
  ({ POST, DELETE, GET } = await import("@/app/api/import/sheet/route"));
  ws = (getDb().prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as { id: number }).id;
  ensureCategory(ws, "אוכל", undefined, "expense");
  ensureCategory(ws, "משכורת", undefined, "income");
});

describe("/api/import/sheet", () => {
  it("writes a cash row as a manual transaction and a bank row as a file batch", async () => {
    const res = await POST(
      post({
        rows: [
          row({ category: "אוכל", tags: ["קפה"], memo: "עם דנה", businessSharePct: 50, owner: null }),
          row({ date: "2024-02-02", description: "משכורת", amount: 9000, kind: "income", account: "בנק הפועלים 999", category: "משכורת" }),
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ added: 2, duplicates: 0, errors: 0, categorized: 2, needsReview: 0 });
    expect(body.importId).toBeTypeOf("number");

    const cash = getDb()
      .prepare("SELECT provider, kind, charged_amount AS amount, category_id AS categoryId, needs_review AS review, business_share_pct AS business, memo FROM transactions WHERE description = 'קפה'")
      .get() as { provider: string; kind: string; amount: number; categoryId: number; review: number; business: number; memo: string };
    expect(cash).toMatchObject({ provider: "cash", kind: "expense", amount: -12.5, review: 0, business: 50, memo: "עם דנה" });
    expect(cash.categoryId).toBeGreaterThan(0);
    const tags = getDb().prepare("SELECT tag FROM transaction_tags WHERE transaction_id IN (SELECT id FROM transactions WHERE description = 'קפה')").all() as { tag: string }[];
    expect(tags.map((t) => t.tag)).toEqual(["קפה"]);

    const bank = getDb()
      .prepare("SELECT provider, kind, charged_amount AS amount FROM transactions WHERE account_number = 'בנק הפועלים 999'")
      .get() as { provider: string; kind: string; amount: number };
    // A row on a real account joins the statement pipeline so the next sync adopts it, not doubles it.
    expect(bank).toEqual({ provider: "file", kind: "income", amount: 9000 });

    const again = await POST(post({ rows: [row({ category: "אוכל" })] }));
    const duplicate = await again.json();
    expect(duplicate).toMatchObject({ added: 0, duplicates: 1 });

    const undo = await DELETE(new Request(`http://127.0.0.1/api/import/sheet?import=${body.importId}`, { method: "DELETE" }));
    expect((await undo.json()).removed).toBe(2);
    const left = getDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE description IN ('קפה', 'משכורת')").get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("dryRun checks without writing", async () => {
    const before = (getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
    const res = await POST(post({ rows: [row({ description: "יבש" })], dryRun: true }));
    const body = await res.json();
    expect(body).toMatchObject({ dryRun: true, ready: 1, duplicates: 0 });
    expect((getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n).toBe(before);
  });

  it("fails the row, not the save, for a category of the wrong type", async () => {
    const res = await POST(post({ rows: [row({ category: "משכורת" })] }));
    const body = await res.json();
    expect(body).toMatchObject({ added: 0, errors: 1 });
    expect(body.rows[0]).toMatchObject({ status: "error", code: "categoryKind" });
  });

  it("rejects an unknown category and a broken amount per row", async () => {
    const res = await POST(post({ rows: [row({ category: "לא קיימת" }), row({ amount: 0 })] }));
    const body = await res.json();
    expect(body.errors).toBe(2);
    expect(body.rows.map((r: { code: string }) => r.code)).toEqual(["unknownCategory", "amountRequired"]);
  });

  it("serves the pickers from GET", async () => {
    const res = await GET(new Request("http://127.0.0.1/api/import/sheet"));
    const body = await res.json();
    expect(body.categories.some((c: { name: string }) => c.name === "אוכל")).toBe(true);
    expect(Array.isArray(body.members)).toBe(true);
  });

  it("caps a paste at 500 rows", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => row({ description: `שורה ${i}` }));
    expect((await POST(post({ rows }))).status).toBe(400);
  });
});
