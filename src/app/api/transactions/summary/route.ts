import { NextResponse } from "next/server";
import { getTransactionsSummary } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to are required" },
      { status: 400 }
    );
  }
  if (!ISO.test(from) || !ISO.test(to)) {
    return NextResponse.json(
      { error: "from and to must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const credentialIds = searchParams
    .getAll("credentialIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  return NextResponse.json(
    getTransactionsSummary(workspaceId, from, to, {
      credentialIds: credentialIds.length > 0 ? credentialIds : undefined,
    })
  );
}
