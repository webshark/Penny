import { israelToday } from "@/server/lib/date-utils";
import { NextResponse } from "next/server";
import { completeAI } from "@/server/ai/ask";
import { MAX_TEXT_IMPORT, parseExtractedRows } from "@/lib/text-import";

export const dynamic = "force-dynamic";

const SYSTEM = `You read a bank or card statement, a receipt, or any pasted text, and list the money movements in it.
Reply with ONLY a JSON array, no prose. Each item: {"date":"YYYY-MM-DD","description":"merchant or payee as written","amount":number,"kind":"expense"|"income"}.
amount is positive; kind says the direction. Dates without a year are in the current year. Skip balances, totals and headers.
If there are no movements, reply [].`;

/**
 * Import from any text: the pasted text goes to the user's own AI provider, and the rows come back for
 * the sheet import's preview. Nothing is saved here; the user checks the rows and imports them there.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > MAX_TEXT_IMPORT) return NextResponse.json({ error: "tooLong" }, { status: 413 });
  const today = israelToday();
  let reply: string | null;
  try {
    reply = await completeAI(SYSTEM, `Today is ${today}.\n\nText:\n${text}`, 4000);
  } catch {
    return NextResponse.json({ error: "aiFailed" }, { status: 502 });
  }
  if (reply == null) return NextResponse.json({ error: "noProvider" }, { status: 503 });
  return NextResponse.json({ rows: parseExtractedRows(reply) });
}
