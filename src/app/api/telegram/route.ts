import { NextResponse } from "next/server";
import { clearBot, getBotConfig, getHideAmounts, saveBot, setHideAmounts } from "@/server/bot/config";
import { restartBot } from "@/server/bot";
import { demoBlockedResponse } from "@/server/demo/guard";

export const dynamic = "force-dynamic";

/** Never returns the token itself. */
export async function GET() {
  const { token, chatId, username, code } = getBotConfig();
  return NextResponse.json({ connected: !!token, linked: !!chatId, username, code: chatId ? null : code, hideAmounts: getHideAmounts() });
}

export async function POST(request: Request) {
  // Verifying a bot calls api.telegram.org; the demo keeps every key and message local.
  const blocked = demoBlockedResponse();
  if (blocked) return blocked;

  const { token } = (await request.json().catch(() => ({}))) as { token?: unknown };
  if (typeof token !== "string" || !/^\d+:[\w-]{30,}$/.test(token.trim())) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`).catch(() => null);
  const me = res?.ok ? ((await res.json()) as { result?: { username?: string } }).result : undefined;
  if (!me?.username) return NextResponse.json({ error: "rejected" }, { status: 400 });
  saveBot(token.trim(), me.username);
  await restartBot();
  return GET();
}

export async function DELETE() {
  clearBot();
  await restartBot();
  return GET();
}

export async function PATCH(request: Request) {
  const { hideAmounts } = (await request.json().catch(() => ({}))) as { hideAmounts?: unknown };
  if (typeof hideAmounts !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });
  setHideAmounts(hideAmounts);
  return GET();
}
