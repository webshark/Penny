import "server-only";

import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { CATEGORY_HIERARCHY_MIGRATION, applyCategoryHierarchy } from "./category-hierarchy";
import { FAMILY_COLORS_MIGRATION, SATURATED_COLORS_MIGRATION, applyFamilyColors } from "./category-colors";
import { PROFILES_MIGRATION, backupBeforeProfiles, seedProfiles, writeProfilesReport } from "./profiles-migration";
import { backupBeforeMigration } from "./backup";
import { israelDay } from "../lib/date-utils";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name)
  );

  let migrationDir = MIGRATIONS_DIR;
  if (!fs.existsSync(migrationDir)) {
    migrationDir = path.join(process.cwd(), "src/server/db/migrations");
  }

  if (!fs.existsSync(migrationDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Existing install about to get profiles: keep a copy first (fresh installs have nothing to lose).
  const backup = applied.size > 0 && [PROFILES_MIGRATION, "047_household_preferences.sql", CATEGORY_HIERARCHY_MIGRATION, FAMILY_COLORS_MIGRATION, SATURATED_COLORS_MIGRATION, "052_profile_pip.sql", "053_policy_cover.sql"].some((f) => !applied.has(f) && files.includes(f)) ? backupBeforeProfiles(db) : null;

  const pending = files.filter((file) => !applied.has(file));
  // Migrations rewrite data. A copy first means a failed or destructive migration is recoverable.
  // The profile migration already wrote its own copy, so only one backup per run.
  if (pending.length > 0 && !backup) backupBeforeMigration(db, "migration");

  // Surface a corrupt file before migrations touch it instead of after.
  const check = db.pragma("quick_check", { simple: true });
  if (check !== "ok") {
    console.error(
      `[db] integrity check failed: ${String(check)}. Backups live in the data/backups folder.`
    );
  }

  for (const file of pending) {

    const sql = fs.readFileSync(path.join(migrationDir, file), "utf-8");

    // Some migrations need to drop and recreate FK-referenced tables. SQLite
    // can't disable foreign_keys inside a transaction, and the recreate
    // pattern temporarily produces dangling refs, so flip the pragma off
    // for the duration of the migration. Then verify with foreign_key_check
    // and turn it back on once we're done.
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        // BEGIN IMMEDIATE takes the write lock before the re-check, so a second process that opened
        // the same database while this one was working waits here and then finds the file applied,
        // instead of re-running an ALTER that would fail with "duplicate column name".
        if (db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(file)) return;
        db.exec(sql);
        if (file === CATEGORY_HIERARCHY_MIGRATION) applyCategoryHierarchy(db);
        if (file === "049_goal_details.sql") addGoalDetails(db);
        if (file === "073_israel_days.sql") toIsraelDays(db);
        if (file === FAMILY_COLORS_MIGRATION || file === SATURATED_COLORS_MIGRATION) applyFamilyColors(db);
        db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      }).immediate();

      const violations = db.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `Foreign key violations after migration ${file}: ${JSON.stringify(violations)}`
        );
      }
    } finally {
      db.pragma("foreign_keys = ON");
    }
    if (file === PROFILES_MIGRATION) {
      const report = seedProfiles(db);
      if (report) writeProfilesReport(db, report, backup);
    }
  }
  // Checked on every start, not only with 052: cheap, and it can't be skipped by a server that read the file before this code.
  addProfilePip(db);
}

/** Rewrites instant-style transaction dates ("…T21:00:00.000Z") as the Israeli calendar day. */
export function toIsraelDays(db: Database.Database): void {
  const rows = db.prepare("SELECT id, date, processed_date FROM transactions WHERE date LIKE '%T%' OR processed_date LIKE '%T%'").all() as { id: number; date: string; processed_date: string | null }[];
  const stmt = db.prepare("UPDATE transactions SET date = ?, processed_date = ? WHERE id = ?");
  for (const r of rows) stmt.run(israelDay(r.date), r.processed_date ? israelDay(r.processed_date) : r.processed_date, r.id);
}

/** Idempotent: SQLite has no ADD COLUMN IF NOT EXISTS. */
function addGoalDetails(db: Database.Database) {
  const cols = new Set((db.pragma("table_info(goals)") as { name: string }[]).map((c) => c.name));
  if (!cols.has("kind")) db.exec("ALTER TABLE goals ADD COLUMN kind TEXT NOT NULL DEFAULT 'general'");
  if (!cols.has("details")) db.exec("ALTER TABLE goals ADD COLUMN details TEXT");
}

/** Each profile's own Pip (JSON: color, skin, name); idempotent, see 052_profile_pip.sql. */
function addProfilePip(db: Database.Database) {
  const cols = new Set((db.pragma("table_info(profiles)") as { name: string }[]).map((c) => c.name));
  if (!cols.has("avatar_pet")) db.exec("ALTER TABLE profiles ADD COLUMN avatar_pet TEXT");
}
