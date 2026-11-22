import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import pkg from "../../../../package.json";
import { getDb } from "@/server/db";
import { dbPath } from "@/server/lib/data-dir";
import { getGlobalSetting } from "@/server/db/queries/settings";
import { isLockEnabled } from "@/server/lib/app-lock";
import { isLanEnabled } from "@/server/lib/lan-access";
import { isDemoMode } from "@/server/demo/mode";
import { redact } from "@/server/lib/redact";

export const dynamic = "force-dynamic";

/**
 * A support file the person downloads and chooses to send when something breaks. Only how the app is set up and
 * how syncs went: counts and states, never amounts, descriptions, account numbers, names or secrets. Sync errors
 * pass through the same redaction as the logs.
 */
export async function GET() {
  const db = getDb();
  const one = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
  const all = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as T[];
  const migrations = all<{ name: string }>("SELECT name FROM _migrations ORDER BY name").map((m) => m.name);
  const report = {
    generatedAt: new Date().toISOString(),
    app: { version: pkg.version, install: process.env.PENNY_INSTALL ?? "source", demo: isDemoMode() },
    system: { platform: process.platform, arch: process.arch, release: os.release(), node: process.version, electron: process.versions.electron ?? null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    database: {
      sizeMb: Math.round((fs.statSync(dbPath()).size / 1024 / 1024) * 10) / 10,
      integrity: db.pragma("quick_check", { simple: true }),
      migrations: migrations.length,
      lastMigration: migrations.at(-1) ?? null,
    },
    features: {
      aiProvider: getGlobalSetting("ai_provider") ?? "none",
      telegram: !!getGlobalSetting("telegram_token") || !!process.env.TELEGRAM_BOT_TOKEN,
      appLock: isLockEnabled(),
      phoneAccess: isLanEnabled(),
    },
    data: {
      workspaces: one<{ n: number }>("SELECT COUNT(*) n FROM workspaces").n,
      transactions: one<{ n: number }>("SELECT COUNT(*) n FROM transactions").n,
      pending: one<{ n: number }>("SELECT COUNT(*) n FROM transactions WHERE status = 'pending'").n,
      uncategorized: one<{ n: number }>("SELECT COUNT(*) n FROM transactions WHERE category_id IS NULL AND kind IN ('expense','income') AND is_excluded = 0").n,
      oldest: one<{ d: string | null }>("SELECT MIN(date) d FROM transactions").d?.slice(0, 7) ?? null,
      newest: one<{ d: string | null }>("SELECT MAX(date) d FROM transactions").d?.slice(0, 7) ?? null,
      balanceGaps: one<{ n: number }>("SELECT COUNT(*) n FROM account_balances WHERE ABS(COALESCE(drift, 0)) >= 1").n,
    },
    connections: all<{ provider: string; n: number }>("SELECT provider, COUNT(*) n FROM bank_credentials GROUP BY provider ORDER BY provider"),
    recentSyncs: all<{ provider: string; status: string; startedAt: string; completedAt: string | null; added: number | null; error: string | null }>(
      `SELECT provider, status, started_at as startedAt, completed_at as completedAt, transactions_added as added, error_message as error
       FROM sync_runs ORDER BY id DESC LIMIT 30`
    ).map((r) => ({ ...r, error: r.error ? redact(r.error) : null })),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="penny-diagnostics-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
