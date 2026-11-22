import { NextResponse } from "next/server";
import { getPaybackState, linkPayback, unlinkPayback } from "@/server/db/queries/paybacks";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const invalid = () => NextResponse.json({ error: "invalid id" }, { status: 400 });
const STATUS: Record<string, number> = { "not-found": 404, "already-linked": 409 };

async function idOf(params: Promise<{ id: string }>): Promise<number | null> {
  const raw = (await params).id;
  const id = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The links touching this row, plus the rows near it that could still be paired with it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const id = await idOf(params);
  if (id == null) return invalid();
  const state = getPaybackState(workspaceId, id);
  return state ? NextResponse.json(state) : NextResponse.json({ error: "not-found" }, { status: 404 });
}

/** Links this row with `targetId`; either one may be the credit. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const id = await idOf(params);
  if (id == null) return invalid();

  const body = (await request.json().catch(() => null)) as { targetId?: unknown } | null;
  const targetId = body?.targetId;
  if (typeof targetId !== "number" || !Number.isSafeInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }

  const result = linkPayback(workspaceId, id, targetId);
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
  }
  return NextResponse.json({ success: true });
}

/** Unlinks the credit this row is: a link always has exactly one credit. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const id = await idOf(params);
  if (id == null) return invalid();
  if (!unlinkPayback(workspaceId, id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
