import { NextResponse } from "next/server";
import { addShare, listShares } from "@/server/db/queries/expense-shares";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

const idOf = async (params: Promise<{ id: string }>) => { const n = Number((await params).id); return Number.isSafeInteger(n) && n > 0 ? n : null; };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  return NextResponse.json({ shares: listShares(getWorkspaceIdFromRequest(request), id) });
}

/** Body: { person, amount }: someone owes `amount` of this expense. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { person?: unknown; amount?: unknown } | null;
  const person = typeof body?.person === "string" ? body.person.trim().slice(0, 80) : "";
  const amount = Number(body?.amount);
  if (!person || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) return NextResponse.json({ error: "person and a positive amount are required" }, { status: 400 });
  const share = addShare(getWorkspaceIdFromRequest(request), id, person, Math.round(amount * 100) / 100);
  if (share === "notFound") return NextResponse.json({ error: "expense not found" }, { status: 404 });
  if (share === "tooMuch") return NextResponse.json({ error: "shares can't add up to more than the expense", code: "tooMuch" }, { status: 400 });
  return NextResponse.json(share);
}
