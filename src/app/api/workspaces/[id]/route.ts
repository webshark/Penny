import { NextResponse } from "next/server";
import {
  deleteWorkspace,
  getWorkspace,
  updateWorkspace,
} from "@/server/db/queries/workspaces";
import { parseAvatar } from "@/lib/profile-avatar";

import { errorResponse } from "@/server/lib/api-error";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const name =
    typeof (body as { name?: unknown })?.name === "string"
      ? ((body as { name: string }).name)
      : "";

  if (!name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  if (!getWorkspace(numericId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const avatar = parseAvatar(body);
  if ("error" in avatar) {
    return NextResponse.json({ error: avatar.error }, { status: 400 });
  }

  try {
    const ws = updateWorkspace(numericId, name, avatar);
    return NextResponse.json(ws);
  } catch (err) {
    return errorResponse("workspaces", err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  if (!getWorkspace(numericId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    deleteWorkspace(numericId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse("workspaces", err);
  }
}
