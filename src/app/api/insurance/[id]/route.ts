import { NextResponse } from "next/server";
import { deleteInsurancePolicy, upsertInsurancePolicy } from "@/server/db/queries/insurance";
import { parsePolicyInput } from "@/server/lib/insurance-input";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Body: the policy fields. Replaces them (the page sends the whole policy). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return bad("invalid id");
  const body = await request.json().catch(() => null);
  const parsed = parsePolicyInput({ ...(body as Record<string, unknown> | null), id: numericId });
  if (typeof parsed === "string") return bad(parsed);
  const saved = upsertInsurancePolicy(workspaceId, parsed);
  return saved == null ? NextResponse.json({ error: "not found" }, { status: 404 }) : NextResponse.json({ success: true, id: saved });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return bad("invalid id");
  return deleteInsurancePolicy(workspaceId, numericId)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
