import { NextResponse } from "next/server";
import { cancelFlowMatch } from "@/server/db/queries/flow-matches";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

/** Undoes the match: the rows return to their previous classification and stay out of auto-matching. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isSafeInteger(matchId) || matchId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  return cancelFlowMatch(workspaceId, matchId)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
