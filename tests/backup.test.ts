import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let db: ReturnType<typeof import("@/server/db/index").getDb>;
let backup: typeof import("@/server/db/backup");

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-backup-"));
  db = (await import("@/server/db/index")).getDb();
  backup = await import("@/server/db/backup");
});

describe("backupBeforeMigration", () => {
  it("copies the database once it holds real tables", () => {
    const file = backup.backupBeforeMigration(db, "test");
    expect(file).toBeTruthy();
    expect(fs.existsSync(file!)).toBe(true);
    expect(fs.statSync(file!).size).toBeGreaterThan(0);
  });

  it("keeps only the newest five copies", async () => {
    for (let i = 0; i < 7; i++) {
      // Distinct timestamps, so each copy gets its own name.
      await new Promise((r) => setTimeout(r, 5));
      backup.backupBeforeMigration(db, "test");
    }
    const copies = fs.readdirSync(backup.backupDir()).filter((f) => f.endsWith(".db"));
    expect(copies.length).toBe(5);
  });
});
