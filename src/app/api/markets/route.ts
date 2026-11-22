import { NextResponse } from "next/server";
import { MARKETS } from "@/lib/markets";
import { getQuotes } from "@/server/markets/quotes";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listWatchedSymbols } from "@/server/db/queries/market-watchlist";
import type { MarketsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const watched = listWatchedSymbols(getWorkspaceIdFromRequest(request));
  const quotes = await getQuotes([...MARKETS.map((m) => m.symbol), ...watched]);
  const payload: MarketsPayload = {
    items: [
      ...MARKETS.map((m) => ({ ...m, quote: quotes.get(m.symbol.toUpperCase()) ?? null })),
      // Watched symbols carry their own name from the quote: there is no translation for a ticker someone typed.
      ...watched.map((symbol) => ({ symbol, key: symbol, group: "watch", quote: quotes.get(symbol.toUpperCase()) ?? null })),
    ],
  };
  return NextResponse.json(payload);
}
