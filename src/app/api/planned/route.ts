import { NextResponse } from "next/server";
import { getAllCategories } from "@/server/db/queries/categories";
import { accountExists, plannedPayload, upsertPlanned } from "@/server/db/queries/planned";
import { getAppSettings } from "@/server/db/queries/settings";
import { parsePlannedInput } from "@/server/lib/planned-input";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";
import { isValidOwner } from "@/lib/tags";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(plannedPayload(workspaceId, israelToday(), Number(process.env.CARD_BILLING_DAY) || 10));
}

/** Body: { item } — creates a planned expense, or updates it when item.id is set. */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  const parsed = parsePlannedInput((body as { item?: unknown } | null)?.item);
  if (typeof parsed === "string") return bad(parsed);

  if (parsed.account && !accountExists(workspaceId, parsed.account)) return bad("unknown account");
  if (parsed.categoryId != null && !getAllCategories(workspaceId).some((c) => c.id === parsed.categoryId)) {
    return bad("unknown category");
  }
  if (parsed.owner != null) {
    const memberIds = getAppSettings(workspaceId).household.members.map((m) => m.id);
    if (!isValidOwner(parsed.owner, memberIds)) return bad("owner must be a household member or shared");
  }

  const id = upsertPlanned(workspaceId, parsed);
  if (id == null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true, id });
}
