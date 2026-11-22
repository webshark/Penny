import { NextResponse } from "next/server";
import { DEMO_BLOCKED_MESSAGE, isDemoMode } from "./mode";

/**
 * The demo must not reach a real bank, fund, model host or messaging service.
 * Every route that would leave the machine returns this instead, so the answer
 * to any such attempt is the same message.
 */
export function demoBlockedResponse(): NextResponse | null {
  if (!isDemoMode()) return null;
  return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 });
}
