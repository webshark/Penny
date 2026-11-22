import "server-only";

import Database from "better-sqlite3";
import fs from "fs";
import { runMigrations } from "./migrate";
import { dataDir, dbPath } from "../lib/data-dir";
import { ensureDemoData } from "../demo/seed";

const DB_DIR = dataDir();
const DB_PATH = dbPath(DB_DIR);

function createDatabase(): Database.Database {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  runMigrations(db);
  ensureDemoData(db);

  return db;
}

declare global {
  var _db: Database.Database | undefined;
}

// Schema revision 052b: refresh a reused development connection after adding migrations.
let migratedConnection: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!globalThis._db) {
    globalThis._db = createDatabase();
  }
  if (migratedConnection !== globalThis._db) { runMigrations(globalThis._db); migratedConnection = globalThis._db; }
  return globalThis._db;
}

/** Closes the shared connection so a restore can replace the file; the next getDb() reopens it. */
export function closeDb(): void {
  globalThis._db?.close();
  globalThis._db = undefined;
  migratedConnection = undefined;
}
