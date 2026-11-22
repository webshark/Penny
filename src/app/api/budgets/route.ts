import { NextResponse } from "next/server";
import { getAllBudgets } from "@/server/db/queries/budgets";
import { setBudgetForPeriod } from "@/server/db/queries/budget-periods";
import { getPlan } from "@/server/db/queries/plan";
import { budgetMonthRange } from "@/lib/finance-period";
import { israelToday } from "@/server/lib/date-utils";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(getAllBudgets(workspaceId));
}

export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    categoryId: number;
    amount?: number | null;
  };

  if (!Number.isSafeInteger(body.categoryId) || body.categoryId <= 0) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 }
    );
  }

  if (body.amount == null) {
    const startDay = getPlan(workspaceId).monthStartDay;
    const range = budgetMonthRange(startDay, israelToday());
    if (!setBudgetForPeriod(workspaceId, range, startDay, body.categoryId, 0)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0) {
    return NextResponse.json(
      { error: "amount must be non-negative" },
      { status: 400 }
    );
  }

  // Writes this period's line and the default later periods inherit, so history stays intact.
  const startDay = getPlan(workspaceId).monthStartDay;
  const range = budgetMonthRange(startDay, israelToday());
  if (!setBudgetForPeriod(workspaceId, range, startDay, body.categoryId, body.amount)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
