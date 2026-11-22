import { currentUser } from "@/server/lib/user-access";
import { NextResponse } from "next/server";
import { errorResponse } from "@/server/lib/api-error";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { controlCommand, controlPayload } from "@/server/db/queries/financial-control";

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      controlPayload(
        getWorkspaceIdFromRequest(request),
        new URL(request.url).searchParams.get("month") ?? undefined
      )
    );
  } catch (error) {
    // A bad month is the caller's mistake (400); anything else is logged and answered as a 500.
    return errorResponse("control", error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid command" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      controlCommand(getWorkspaceIdFromRequest(request), body, currentUser(request)?.id ?? null)
    );
  } catch (error) {
    return errorResponse("control", error);
  }
}
