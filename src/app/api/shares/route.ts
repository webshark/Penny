import { NextResponse } from "next/server";
import { listShares, settlePerson } from "@/server/db/queries/expense-shares";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({ shares: listShares(getWorkspaceIdFromRequest(request)) });
}

/** Body: { settlePerson }: marks all of that person's open shares as paid back. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { settlePerson?: unknown } | null;
  const person = typeof body?.settlePerson === "string" ? body.settlePerson.trim() : "";
  if (!person) return NextResponse.json({ error: "settlePerson is required" }, { status: 400 });
  return NextResponse.json({ settled: settlePerson(getWorkspaceIdFromRequest(request), person) });
}
