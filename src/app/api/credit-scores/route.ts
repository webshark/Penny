import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CreditScore } from "@/lib/credit-score";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const scores = getDb().prepare("SELECT id, date, bureau, score, note FROM credit_scores WHERE workspace_id = ? ORDER BY date DESC, id DESC").all(ws) as CreditScore[];
  return NextResponse.json({ scores });
}

/** Body: { date: YYYY-MM-DD, score: 0-1000, bureau?, note? }. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const score = Number(body?.score);
  if (!date || !Number.isInteger(score) || score < 0 || score > 1000) return NextResponse.json({ error: "a date and a whole score from 0 to 1000 are required" }, { status: 400 });
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const ws = getWorkspaceIdFromRequest(request);
  const id = Number(getDb().prepare("INSERT INTO credit_scores (workspace_id, date, bureau, score, note) VALUES (?, ?, ?, ?, ?)").run(ws, date, text(body?.bureau, 60), score, text(body?.note, 200)).lastInsertRowid);
  return NextResponse.json({ id, date, bureau: text(body?.bureau, 60), score, note: text(body?.note, 200) });
}
