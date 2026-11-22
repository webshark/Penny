import { NextResponse } from "next/server";
import { deleteProfile, getProfile, updateProfile } from "@/server/db/queries/profiles";
import { parseAvatar } from "@/lib/profile-avatar";

type Ctx = { params: Promise<{ id: string }> };
async function profileId({ params }: Ctx) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 && getProfile(id) ? id : null;
}

import { errorResponse } from "@/server/lib/api-error";

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await profileId(ctx);
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const avatar = parseAvatar(body);
  if ("error" in avatar) return NextResponse.json({ error: avatar.error }, { status: 400 });
  try {
    return NextResponse.json(updateProfile(id, name, avatar));
  } catch (err) {
    return errorResponse("profiles", err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const id = await profileId(ctx);
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    deleteProfile(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse("profiles", err);
  }
}
