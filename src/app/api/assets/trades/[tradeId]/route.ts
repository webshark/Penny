import { NextResponse } from "next/server";
import { deleteTrade } from "@/server/db/queries/holding-trades";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  return deleteTrade(getWorkspaceIdFromRequest(request), Number((await params).tradeId))
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
