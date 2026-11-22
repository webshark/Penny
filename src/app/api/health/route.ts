import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "node:fs";
import pkg from "../../../../package.json";
import path from "node:path";
import { dataDir } from "@/server/lib/data-dir";

export const dynamic = "force-dynamic";

/** How long a healthy answer is reused: setup polls this endpoint twice a second. */
const OK_TTL_MS = 60_000;

type DatabaseCheck =
  | { state: "empty" } // first run: no database yet is normal, not a failure
  | { state: "ok"; tables: number }
  | { state: "corrupt"; detail: string }
  | { state: "unreadable"; detail: string };

let cached: { at: number; check: DatabaseCheck } | null = null;

function databaseFile(): string | undefined {
  const dir = dataDir();
  return ["penny.db", "spent.db"] // legacy: spent.db from installs before the Penny rename
    .map((f) => path.join(dir, f))
    .find((f) => fs.existsSync(f));
}

/**
 * Opens the database read-only and asks SQLite whether the file is intact. Never writes:
 * a health check must not migrate or touch the app's data.
 */
function inspect(file: string): DatabaseCheck {
  let probe: Database.Database | undefined;
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = probe.pragma("quick_check", { simple: true });
    const { tables } = probe
      .prepare("SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'")
      .get() as { tables: number };
    if (integrity !== "ok") return { state: "corrupt", detail: String(integrity) };
    return { state: "ok", tables };
  } catch (err) {
    return { state: "unreadable", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      probe?.close();
    } catch {
      // A probe that cannot close has already been reported by the state above.
    }
  }
}

function checkDatabase(): DatabaseCheck {
  const file = databaseFile();
  if (!file) return { state: "empty" };
  // quick_check reads the whole file, so a good answer is kept for a minute. A bad one is
  // never cached: a database that was only locked must report healthy as soon as it opens.
  if (cached && Date.now() - cached.at < OK_TTL_MS) return cached.check;
  const check = inspect(file);
  cached = check.state === "ok" ? { at: Date.now(), check } : null;
  return check;
}

export function GET() {
  const database = checkDatabase();
  // Always 200: the setup script and the service wrapper read `ok` and expect a body even
  // when the database is the thing that is broken.
  return NextResponse.json({
    ok: database.state === "ok" || database.state === "empty",
    version: pkg.version,
    hasDb: database.state !== "empty", // kept for older callers
    database,
  });
}
