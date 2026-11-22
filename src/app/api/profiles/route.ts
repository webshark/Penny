import { NextResponse } from "next/server";
import { createProfile, listProfiles } from "@/server/db/queries/profiles";
import { parseAvatar } from "@/lib/profile-avatar";

import { errorResponse } from "@/server/lib/api-error";

export async function GET() {
  return NextResponse.json(listProfiles());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const avatar = parseAvatar(body);
  if ("error" in avatar) return NextResponse.json({ error: avatar.error }, { status: 400 });
  try {
    return NextResponse.json(createProfile(name, avatar), { status: 201 });
  } catch (err) {
    return errorResponse("profiles", err);
  }
}
