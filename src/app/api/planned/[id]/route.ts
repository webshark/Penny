import { NextResponse } from "next/server";
import { deletePlanned, setPlannedStatus } from "@/server/db/queries/planned";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { PLANNED_STATUSES, type PlannedStatus } from "@/lib/planned";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Body: { status } — for cancelling or restoring; full edits go through POST /api/planned. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return bad("invalid id");
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status as PlannedStatus | undefined;
  if (!status || !PLANNED_STATUSES.includes(status)) return bad("unknown status");
  return setPlannedStatus(workspaceId, numericId, status)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return bad("invalid id");
  return deletePlanned(workspaceId, numericId)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
