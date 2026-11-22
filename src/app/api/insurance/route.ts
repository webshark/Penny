import { NextResponse } from "next/server";
import { listInsurance, upsertInsurancePolicy } from "@/server/db/queries/insurance";
import { parsePolicyInput } from "@/server/lib/insurance-input";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET(request: Request) {
  return NextResponse.json(listInsurance(getWorkspaceIdFromRequest(request)));
}

/** Body: { item } — creates a policy, or updates it when item.id is set. */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  const parsed = parsePolicyInput((body as { item?: unknown } | null)?.item);
  if (typeof parsed === "string") return bad(parsed);
  const id = upsertInsurancePolicy(workspaceId, parsed);
  if (id == null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true, id });
}
