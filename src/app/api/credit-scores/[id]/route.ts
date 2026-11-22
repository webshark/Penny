import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const gone = getDb().prepare("DELETE FROM credit_scores WHERE workspace_id = ? AND id = ?").run(getWorkspaceIdFromRequest(request), id).changes > 0;
  return gone ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
