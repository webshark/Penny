import { NextResponse } from "next/server";
import { addTrade, listTrades } from "@/server/db/queries/holding-trades";
import { holdingFromTrades, parseTradeInput } from "@/lib/holding-trades";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

const idOf = async (params: Promise<{ id: string }>) => { const n = Number((await params).id); return Number.isSafeInteger(n) && n > 0 ? n : null; };

/** A holding's buys and sells, newest first, with what they add up to. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const trades = listTrades(getWorkspaceIdFromRequest(request), id);
  return NextResponse.json({ trades, summary: holdingFromTrades(trades) });
}

/** Body: { date, kind: "buy" | "sell", quantity, price, fee?, note? }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const input = parseTradeInput(await request.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const trade = addTrade(getWorkspaceIdFromRequest(request), id, input);
  return trade ? NextResponse.json(trade) : NextResponse.json({ error: "holding not found" }, { status: 404 });
}
