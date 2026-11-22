import { NextResponse } from "next/server";
import { buildAccountsForecast, saveCardBankMapping } from "@/server/insights/accounts-forecast";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";

export const dynamic = "force-dynamic";

/**
 * 90-day balance. `forecast` is the familiar single bank line (every account added together),
 * `accounts` is the same projection per bank account with a low/high band, and `cardBanks`
 * says which bank pays each card's statement.
 */
export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const today = israelToday();
  const accounts = buildAccountsForecast(ws, today);
  if (!accounts) return NextResponse.json({ forecast: null, accounts: null, cardBanks: [] });

  const paydays = accounts.events.filter((e) => e.kind === "income").map((e) => e.date).sort();
  const low = accounts.total.lowest;
  return NextResponse.json({
    forecast: {
      points: accounts.total.points.map((p) => ({ date: p.date, balance: p.expected })),
      low: { date: low.date, balance: low.amount },
      firstNegative: accounts.total.points.find((p) => p.expected < 0)?.date ?? null,
      nextPayday: paydays.find((d) => d > low.date) ?? null,
    },
    accounts,
  });
}

/** Body: { card, bank } — pins a card's statement to a bank account; bank null clears the choice. */
export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as { card?: unknown; bank?: unknown } | null;
  if (typeof body?.card !== "string" || !(body.bank === null || typeof body.bank === "string")) {
    return NextResponse.json({ error: "card and bank are required" }, { status: 400 });
  }
  if (!saveCardBankMapping(ws, body.card, body.bank)) {
    return NextResponse.json({ error: "unknown card or bank" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
