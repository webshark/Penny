import { NextResponse } from "next/server";
import { listNotifications } from "@/server/db/queries/notifications";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return NextResponse.json({ items: listNotifications(getWorkspaceIdFromRequest(request)) });
}
