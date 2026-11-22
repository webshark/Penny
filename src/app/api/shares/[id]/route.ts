import { NextResponse } from "next/server";
import { deleteShare, setShareSettled } from "@/server/db/queries/expense-shares";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

const idOf = async (params: Promise<{ id: string }>) => { const n = Number((await params).id); return Number.isSafeInteger(n) && n > 0 ? n : null; };

/** Body: { settled: boolean }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { settled?: unknown } | null;
  if (typeof body?.settled !== "boolean") return NextResponse.json({ error: "settled must be true or false" }, { status: 400 });
  return setShareSettled(getWorkspaceIdFromRequest(request), id, body.settled) ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  return deleteShare(getWorkspaceIdFromRequest(request), id) ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
