import "server-only";

import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import { dataDir } from "../lib/data-dir";

const KEEP_BACKUPS = 5;

export function backupDir(): string {
  return path.join(dataDir(), "backups");
}

/**
 * Copies the database before a migration touches it. WAL contents are checkpointed into the main
 * file first, so the copy is a complete snapshot rather than a half-written one.
 * Returns the backup path, or null when there is nothing to back up yet.
 */
export function backupBeforeMigration(db: Database.Database, reason: string): string | null {
  const dbPath = path.join(dataDir(), "penny.db");
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return null;

  // A first run has only the migration bookkeeping table, so there is nothing worth copying yet.
  const userTables = db
    .prepare(
      "SELECT COUNT(*) as n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'"
    )
    .get() as { n: number };
  if (userTables.n === 0) return null;

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  db.pragma("wal_checkpoint(TRUNCATE)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `penny-${stamp}-${reason}.db`);
  fs.copyFileSync(dbPath, target);

  pruneBackups(dir);
  console.log(`[db] backed up before ${reason}: ${target}`);
  return target;
}

function pruneBackups(dir: string): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("penny-") && f.endsWith(".db"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files.slice(KEEP_BACKUPS)) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
}
