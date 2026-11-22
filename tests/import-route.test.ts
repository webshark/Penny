import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let POST: typeof import("@/app/api/import/route").POST;
let DELETE: typeof import("@/app/api/import/route").DELETE;
let getDb: typeof import("@/server/db/index").getDb;

const req = (body: unknown) =>
  new Request("http://127.0.0.1/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ POST, DELETE } = await import("@/app/api/import/route"));
});

describe("/api/import", () => {
  it("keeps a card refund as an expense, flags it for review and skips it on re-import", async () => {
    const rows = [
      { date: "2024-02-01", description: "קפה", amount: -12.5 },
      { date: "2024-02-02", description: "זיכוי בית עסק", amount: 20 },
    ];
    const res = await POST(req({ account: "ישראכרט 1234", rows, source: "card" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(2);
    expect(body.needsReview).toBe(2);

    const stored = getDb()
      .prepare("SELECT description, kind, needs_review AS review FROM transactions WHERE account_number = ? ORDER BY date")
      .all("ישראכרט 1234") as { description: string; kind: string; review: number }[];
    // A refund on a card statement must stay a (negative) expense, never income.
    expect(stored).toEqual([
      { description: "קפה", kind: "expense", review: 1 },
      { description: "זיכוי בית עסק", kind: "expense", review: 1 },
    ]);

    const again = await POST(req({ account: "ישראכרט 1234", rows, source: "card" }));
    const duplicate = await again.json();
    expect(duplicate.added).toBe(0);
    expect(duplicate.duplicates).toBe(2);

    const undo = await DELETE(new Request(`http://127.0.0.1/api/import?batch=${body.batchId}`, { method: "DELETE" }));
    expect((await undo.json()).removed).toBe(2);
  });

  it("treats a positive bank row as income", async () => {
    const res = await POST(
      req({ account: "בנק הפועלים 999", rows: [{ date: "2024-03-01", description: "משכורת", amount: 9000 }], source: "bank" }),
    );
    expect((await res.json()).added).toBe(1);
    const row = getDb()
      .prepare("SELECT kind FROM transactions WHERE account_number = ?")
      .get("בנק הפועלים 999") as { kind: string };
    expect(row.kind).toBe("income");
  });
});
