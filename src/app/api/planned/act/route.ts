import { NextResponse } from "next/server";
import { linkPlanned, matchPlanned, rejectCandidate, unlinkPlanned } from "@/server/db/queries/planned";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Body: { action, itemId?, txnId? }.
 * "match" runs the automatic matching, "link" takes a candidate the user picked,
 * "reject" hides one candidate, "unlink" undoes a match.
 */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as { action?: unknown; itemId?: unknown; txnId?: unknown } | null;
  const action = body?.action;
  const itemId = body?.itemId == null ? null : Number(body.itemId);
  const txnId = body?.txnId == null ? null : Number(body.txnId);

  if (action === "match") return NextResponse.json(matchPlanned(workspaceId, israelToday()));
  if (action !== "link" && action !== "reject" && action !== "unlink") return bad("unknown action");
  if (itemId == null || !Number.isInteger(itemId)) return bad("invalid item");

  if (action === "unlink") {
    return unlinkPlanned(workspaceId, itemId) ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (txnId == null || !Number.isInteger(txnId)) return bad("invalid transaction");
  const done = action === "link" ? linkPlanned(workspaceId, itemId, txnId) : rejectCandidate(workspaceId, itemId, txnId);
  return done ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
