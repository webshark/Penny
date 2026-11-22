import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// Every overlap case between two statement files for the same account.
let POST: typeof import("@/app/api/import/route").POST;
let DELETE: typeof import("@/app/api/import/route").DELETE;
let getDb: typeof import("@/server/db/index").getDb;

const req = (body: unknown) =>
  new Request("http://127.0.0.1/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const row = (date: string, description: string, amount: number) => ({ date, description, amount });
const importRows = async (account: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  (await (await POST(req({ account, rows, ...extra }))).json()) as { added: number; duplicates: number; ready: number; batchId: number | null };
const count = (account: string) =>
  (getDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE account_number = ?").get(account) as { n: number }).n;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-combo-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ POST, DELETE } = await import("@/app/api/import/route"));
});

describe("statement import: addition, duplication and overlap", () => {
  it("adds a first file, then skips the whole file when it is imported again", async () => {
    const rows = [row("2025-01-02", "סופר", -100), row("2025-01-03", "דלק", -200)];
    expect(await importRows("לאומי 111", rows)).toMatchObject({ added: 2, duplicates: 0 });
    expect(await importRows("לאומי 111", rows)).toMatchObject({ added: 0, duplicates: 2, ready: 0 });
    expect(count("לאומי 111")).toBe(2);
  });

  it("adds only the new rows of a file that overlaps the previous one", async () => {
    const first = [row("2025-02-01", "שכר דירה", -4000), row("2025-02-02", "חשמל", -300)];
    await importRows("הפועלים 222", first);
    const second = [
      row("2025-02-02", "חשמל", -300), // already there
      row("2025-02-10", "אינטרנט", -90),
      row("2025-02-11", "מים", -140),
    ];
    const res = await importRows("הפועלים 222", second);
    expect(res).toMatchObject({ added: 2, duplicates: 1 });
    expect(count("הפועלים 222")).toBe(4);
  });

  it("keeps two genuinely identical charges and only dedupes the matching copies", async () => {
    const twice = [row("2025-03-01", "קפה", -12), row("2025-03-01", "קפה", -12)];
    expect(await importRows("מזומן 333", twice)).toMatchObject({ added: 2 });
    // Re-importing the same pair: both are matches, one copy per stored row, so nothing is added.
    expect(await importRows("מזומן 333", twice)).toMatchObject({ added: 0, duplicates: 2 });
    // A third identical charge after the fact is a new charge, not a duplicate of a used pair.
    expect(await importRows("מזומן 333", [row("2025-03-01", "קפה", -12)])).toMatchObject({ added: 0, duplicates: 1 });
    expect(count("מזומן 333")).toBe(2);
  });

  it("treats a posting one day later as the same transaction", async () => {
    await importRows("דיסקונט 444", [row("2025-04-10", "ביטוח", -250)]);
    const shifted = await importRows("דיסקונט 444", [row("2025-04-11", "ביטוח", -250)]);
    expect(shifted).toMatchObject({ added: 0, duplicates: 1 });
  });

  it("does not dedupe by description alone: a different amount is a different charge", async () => {
    await importRows("mercantile 555", [row("2025-05-05", "סופר", -50)]);
    expect(await importRows("mercantile 555", [row("2025-05-05", "סופר", -50)])).toMatchObject({ added: 0, duplicates: 1 });
    expect(await importRows("mercantile 555", [row("2025-05-05", "סופר", -51)])).toMatchObject({ added: 1, duplicates: 0 });
  });

  it("never crosses accounts: the same statement in two accounts is kept twice", async () => {
    const rows = [row("2025-06-01", "מנוי", -30)];
    expect(await importRows("כרטיס א", rows)).toMatchObject({ added: 1 });
    expect(await importRows("כרטיס ב", rows)).toMatchObject({ added: 1 });
    expect(count("כרטיס א")).toBe(1);
    expect(count("כרטיס ב")).toBe(1);
  });

  it("restores rows after an undo, then dedupes them again on re-import", async () => {
    const rows = [row("2025-07-01", "תיקון", -70)];
    const first = await importRows("בנק 666", rows);
    expect(first.added).toBe(1);
    await DELETE(new Request(`http://127.0.0.1/api/import?batch=${first.batchId}`, { method: "DELETE" }));
    expect(count("בנק 666")).toBe(0);
    expect(await importRows("בנק 666", rows)).toMatchObject({ added: 1 });
  });

  it("removes only its own batch when a later file overlapped it", async () => {
    const a = await importRows("בנק 777", [row("2025-08-01", "A", -10)]);
    const b = await importRows("בנק 777", [row("2025-08-01", "A", -10), row("2025-08-02", "B", -20)]);
    expect(b).toMatchObject({ added: 1, duplicates: 1 });
    await DELETE(new Request(`http://127.0.0.1/api/import?batch=${b.batchId}`, { method: "DELETE" }));
    const left = getDb()
      .prepare("SELECT description FROM transactions WHERE account_number = ? ORDER BY description")
      .all("בנק 777") as { description: string }[];
    expect(left.map((r) => r.description)).toEqual(["A"]);
    expect(a.added).toBe(1);
  });

  it("counts without writing on a dry run, and trims the account name", async () => {
    const rows = [row("2025-09-01", "בדיקה", -5)];
    expect(await importRows("  בנק 888  ", rows, { dryRun: true })).toMatchObject({ ready: 1, added: 0, batchId: null });
    expect(count("בנק 888")).toBe(0);
    expect(await importRows("בנק 888", rows)).toMatchObject({ added: 1 });
    expect(await importRows("  בנק 888  ", rows)).toMatchObject({ added: 0, duplicates: 1 });
  });

  it("rejects rows that cannot be a transaction", async () => {
    const bad = [
      [{ date: "2025-13-01", description: "x", amount: -5 }],
      [{ date: "2025-10-01", description: "x", amount: 0 }],
      [{ date: "2025-10-01", description: "  ", amount: -5 }],
      [{ date: "2024-10-01", description: "x", amount: 1e9 }],
    ];
    for (const rows of bad) {
      const res = await POST(req({ account: "בנק 999", rows }));
      expect(res.status).toBe(400);
    }
    expect((await POST(req({ account: "", rows: [row("2025-10-01", "x", -1)] }))).status).toBe(400);
    expect((await POST(req({ account: "בנק 999", rows: [] }))).status).toBe(400);
  });
});
