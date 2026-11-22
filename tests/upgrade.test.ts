import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let db: ReturnType<typeof import("@/server/db/index").getDb>;
let runMigrations: typeof import("@/server/db/migrate").runMigrations;
let backupDir: typeof import("@/server/db/backup").backupDir;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-upgrade-"));
  db = (await import("@/server/db/index")).getDb();
  ({ runMigrations } = await import("@/server/db/migrate"));
  ({ backupDir } = await import("@/server/db/backup"));
});

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe("upgrading an existing database", () => {
  it("applies a pending migration, keeps the rows and leaves a pre-migration copy", () => {
    const categoriesBefore = count("SELECT COUNT(*) AS n FROM categories");
    const migrationsBefore = count("SELECT COUNT(*) AS n FROM _migrations");

    // Pretend the install predates the smart sheet: the table is gone and the row is unrecorded.
    db.prepare("DELETE FROM _migrations WHERE name = ?").run("058_sheet_imports.sql");
    db.exec("DROP TABLE IF EXISTS sheet_import_rows");
    db.exec("DROP TABLE IF EXISTS sheet_imports");

    runMigrations(db);

    expect(count("SELECT COUNT(*) AS n FROM _migrations")).toBe(migrationsBefore);
    expect(count("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'sheet_imports'")).toBe(1);
    // The upgrade must not lose or duplicate user data on the way.
    expect(count("SELECT COUNT(*) AS n FROM categories")).toBe(categoriesBefore);

    const copies = fs.readdirSync(backupDir()).filter((f) => f.endsWith(".db"));
    expect(copies.length).toBeGreaterThan(0);
    const newest = copies.map((f) => fs.statSync(path.join(backupDir(), f)).mtimeMs).sort((a, b) => b - a)[0];
    expect(Date.now() - newest).toBeLessThan(60_000);
  });

  it("is idempotent: a second run applies nothing", () => {
    const before = count("SELECT COUNT(*) AS n FROM _migrations");
    runMigrations(db);
    expect(count("SELECT COUNT(*) AS n FROM _migrations")).toBe(before);
  });
});
