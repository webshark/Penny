import { NextResponse } from "next/server";
import { isLanEnabled, setLanEnabled } from "@/server/lib/lan-access";
import { cookies } from "next/headers";
import {
  IDLE_CHOICES, SESSION_COOKIE, changeLock, checkSecret, createSession, disableLock, enableLock,
  endSession, idleMinutes, isLockEnabled, isValidSecret,
} from "@/server/lib/app-lock";
import { withSession } from "./session-cookie";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: isLockEnabled(), idleMinutes: idleMinutes() });
}

type Body = { action?: string; current?: unknown; secret?: unknown; idleMinutes?: unknown };

/** enable | change | disable | lock. Change and disable need the current passphrase. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const idle = IDLE_CHOICES.find((m) => m === body.idleMinutes) ?? idleMinutes();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (body.action === "lock") {
    endSession(token);
    return withSession(NextResponse.json({ ok: true }), request, null);
  }
  if (body.action === "enable") {
    if (isLockEnabled()) return NextResponse.json({ error: "already_enabled" }, { status: 409 });
    if (!isValidSecret(body.secret)) return NextResponse.json({ error: "weak" }, { status: 400 });
    await enableLock(body.secret, idle);
    // Keep the person who just set it up signed in.
    return withSession(NextResponse.json({ ok: true }), request, createSession());
  }
  if (body.action !== "change" && body.action !== "disable") return NextResponse.json({ error: "bad_action" }, { status: 400 });

  const check = await checkSecret(body.current);
  if (!check.ok) return NextResponse.json({ error: check.reason, retryAfter: check.retryAfter }, { status: check.reason === "wait" ? 429 : 401 });
  const current = body.current as string;
  if (body.action === "disable") {
    await disableLock(current);
    // Phone access is allowed only behind the lock: without it, anyone on the network could reach the data.
    if (isLanEnabled()) {
      setLanEnabled(false);
      if (process.env.PENNY_LISTEN_HOST === "0.0.0.0" && process.env.PENNY_RESTARTABLE === "1") setTimeout(() => process.exit(75), 300);
    }
    return withSession(NextResponse.json({ ok: true }), request, null);
  }
  const next = typeof body.secret === "string" && body.secret !== "" ? body.secret : null;
  if (next !== null && !isValidSecret(next)) return NextResponse.json({ error: "weak" }, { status: 400 });
  await changeLock(current, next, idle);
  return NextResponse.json({ ok: true });
}
