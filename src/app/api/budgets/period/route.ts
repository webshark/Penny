import { NextResponse } from "next/server";
import { getPlan } from "@/server/db/queries/plan";
import { budgetHistory, getPeriodBudget, setRolloverRule } from "@/server/db/queries/budget-periods";
import { budgetMonthByKey, budgetMonthRange, isRolloverRule } from "@/lib/finance-period";
import { israelToday } from "@/server/lib/date-utils";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

/** The household month, its effective budgets and the last months. */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const params = new URL(request.url).searchParams;
  const startDay = getPlan(workspaceId).monthStartDay;
  const today = israelToday();
  const month = params.get("month");
  const months = Math.min(Math.max(Math.trunc(Number(params.get("months") ?? "6")) || 6, 1), 12);
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "invalid month" }, { status: 400 });
  }
  const range = month ? budgetMonthByKey(startDay, month) : budgetMonthRange(startDay, today);
  const { lines, view } = getPeriodBudget(workspaceId, range, startDay);
  return NextResponse.json({ view, lines, history: budgetHistory(workspaceId, startDay, today, months) });
}

/** Body: { categoryId, rollover } — how a category's leftover follows into the next month. */
export async function PATCH(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as { categoryId?: unknown; rollover?: unknown } | null;
  const categoryId = Number(body?.categoryId);
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0 || !isRolloverRule(body?.rollover)) {
    return NextResponse.json({ error: "categoryId and rollover are required" }, { status: 400 });
  }
  return setRolloverRule(workspaceId, categoryId, body.rollover)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
