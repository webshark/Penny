import { NextResponse } from "next/server";
import { listFlowMatches } from "@/server/db/queries/flow-matches";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

/** The automatic pairings still in force. Undo is DELETE /api/flow-matches/[id]. */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listFlowMatches(workspaceId));
}
