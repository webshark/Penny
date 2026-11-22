import { NextResponse } from "next/server";
import { getBudgetMoves, setBudgetMoves } from "@/server/db/queries/budgets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isMove } from "@/lib/budget-moves";
import { roundCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const MONTH = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!MONTH.test(month)) return NextResponse.json({ error: "month is required" }, { status: 400 });
  return NextResponse.json(getBudgetMoves(ws)[month] ?? []);
}

/** Adds one move for that month only. */
export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as { month?: string; from?: number; to?: number; amount?: number } | null;
  const move = { from: body?.from, to: body?.to, amount: roundCents(body?.amount ?? 0) };
  if (!body || !MONTH.test(body.month ?? "") || !isMove(move)) return NextResponse.json({ error: "invalid move" }, { status: 400 });
  const all = getBudgetMoves(ws);
  all[body.month!] = [...(all[body.month!] ?? []), move];
  setBudgetMoves(ws, all);
  return NextResponse.json(all[body.month!]);
}

/** Undo: removes move `index` of that month (default: the latest). */
export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? "";
  if (!MONTH.test(month)) return NextResponse.json({ error: "month is required" }, { status: 400 });
  const all = getBudgetMoves(ws);
  const current = all[month] ?? [];
  const rawIndex = params.get("index");
  const index = rawIndex == null ? current.length - 1 : Number(rawIndex);
  if (!Number.isInteger(index)) return NextResponse.json({ error: "invalid index" }, { status: 400 });
  const list = current.filter((_, i) => i !== index);
  if (list.length) all[month] = list;
  else delete all[month];
  setBudgetMoves(ws, all);
  return NextResponse.json(list);
}
