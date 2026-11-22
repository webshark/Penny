import { NextResponse } from "next/server";
import { normalizeSymbol } from "@/lib/markets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { addWatchedSymbol, listWatchedSymbols, removeWatchedSymbol } from "@/server/db/queries/market-watchlist";

export const dynamic = "force-dynamic";

/** The household's own symbols on Markets. Same-origin mutations go through the app's proxy like every other write. */
export async function GET(request: Request) {
  return NextResponse.json({ symbols: listWatchedSymbols(getWorkspaceIdFromRequest(request)) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { symbol?: unknown } | null;
  const symbol = normalizeSymbol(body?.symbol);
  if (!symbol) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  addWatchedSymbol(getWorkspaceIdFromRequest(request), symbol);
  return NextResponse.json({ symbol });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { symbol?: unknown } | null;
  const symbol = normalizeSymbol(body?.symbol);
  if (!symbol) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  removeWatchedSymbol(getWorkspaceIdFromRequest(request), symbol);
  return new NextResponse(null, { status: 204 });
}