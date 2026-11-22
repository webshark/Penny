import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { DoneSaving } from "@/lib/money-on-table";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const done = getDb().prepare("SELECT key, yearly FROM savings_done WHERE workspace_id = ? ORDER BY done_at").all(getWorkspaceIdFromRequest(request)) as DoneSaving[];
  return NextResponse.json({ done });
}

/** Body: { key, yearly, done: boolean }. Marks a "money on the table" item done (keeping its yearly saving) or undoes it. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const key = typeof body?.key === "string" ? body.key.slice(0, 300) : "";
  const yearly = Number(body?.yearly ?? 0);
  if (!key || !Number.isFinite(yearly) || yearly < 0 || yearly > 10_000_000) return NextResponse.json({ error: "a key and a yearly amount of 0 or more are required" }, { status: 400 });
  const ws = getWorkspaceIdFromRequest(request);
  const db = getDb();
  if (body?.done === false) db.prepare("DELETE FROM savings_done WHERE workspace_id = ? AND key = ?").run(ws, key);
  else db.prepare("INSERT INTO savings_done (workspace_id, key, yearly) VALUES (?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET yearly = excluded.yearly").run(ws, key, yearly);
  return NextResponse.json({ success: true });
}
