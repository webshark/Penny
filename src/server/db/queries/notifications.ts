import "server-only";

import { getDb } from "../index";
import { listGoals } from "./plan";
import type { AppNotification } from "@/lib/notifications";

/**
 * What happened, newest first: bank syncs that finished (with new transactions) or failed in the last two weeks,
 * and goals that reached their target. Built from data the app already keeps, so nothing new is stored.
 */
export function listNotifications(workspaceId: number): AppNotification[] {
  const runs = getDb()
    .prepare(
      `SELECT id, provider, status, transactions_added AS added, COALESCE(completed_at, started_at) AS at
       FROM sync_runs WHERE workspace_id = ? AND status IN ('completed','failed') AND started_at >= datetime('now','-14 days')
       ORDER BY id DESC LIMIT 15`
    )
    .all(workspaceId) as { id: number; provider: string; status: "completed" | "failed"; added: number | null; at: string }[];
  const syncs: AppNotification[] = runs
    .filter((r) => r.status === "failed" || (r.added ?? 0) > 0)
    .map((r) => r.status === "failed"
      ? { key: `sync-${r.id}`, kind: "syncFailed", at: r.at, provider: r.provider, href: "/settings/bank" }
      : { key: `sync-${r.id}`, kind: "syncDone", at: r.at, provider: r.provider, count: r.added ?? 0, href: "/transactions" });
  // A goal stays "reached" until its target changes, so the key carries the target.
  const goals: AppNotification[] = listGoals(workspaceId)
    .filter((g) => g.targetAmount > 0 && g.savedAmount >= g.targetAmount)
    .map((g) => ({ key: `goal-${g.id}-${g.targetAmount}`, kind: "goalReached", at: null, name: g.name, amount: g.targetAmount, href: "/journey" }));
  return [...goals, ...syncs];
}
