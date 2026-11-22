import { beforeEach, afterEach, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock("@/server/db", () => ({ getDb: () => holder.db }));
import { runMigrations } from "@/server/db/migrate";
import { listNotifications } from "@/server/db/queries/notifications";
import { markAllRead, unread } from "@/lib/notifications";

beforeEach(() => { holder.db = new Database(":memory:"); runMigrations(holder.db); });
afterEach(() => holder.db.close());

it("lists failed syncs and syncs that added transactions, skips empty ones, and adds reached goals", () => {
  const run = holder.db.prepare("INSERT INTO sync_runs(id,workspace_id,provider,status,transactions_added,scrape_from_date,started_at,completed_at) VALUES (?,1,'hapoalim',?,?,'2026-01-01',datetime('now','-1 day'),datetime('now','-1 day'))");
  run.run(1, "completed", 5); run.run(2, "completed", 0); run.run(3, "failed", 0);
  holder.db.prepare("INSERT INTO sync_runs(id,workspace_id,provider,status,transactions_added,scrape_from_date,started_at) VALUES (4,1,'max','failed',0,'2026-01-01',datetime('now','-30 days'))").run();
  holder.db.exec("INSERT INTO goals(id,workspace_id,name,target_amount,target_date,saved_amount) VALUES (1,1,'Trip',1000,'2027-01',1000),(2,1,'Car',5000,'2027-01',100)");
  const items = listNotifications(1);
  expect(items.map((n) => n.key)).toEqual(["goal-1-1000", "sync-3", "sync-1"]);
  expect(items.find((n) => n.key === "sync-1")).toMatchObject({ kind: "syncDone", count: 5 });
  expect(listNotifications(2)).toEqual([]);
  // Read state: marking all keeps exactly the listed keys.
  expect(unread(items, ["sync-1"]).map((n) => n.key)).toEqual(["goal-1-1000", "sync-3"]);
  expect(unread(items, markAllRead(items))).toEqual([]);
});
