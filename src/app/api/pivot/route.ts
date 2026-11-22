import { NextResponse } from "next/server";
import { getCategoryBreakdown } from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { buildPivot, lastMonths, type PivotParent } from "@/lib/pivot";

export const dynamic = "force-dynamic";

/** Spending by category for the last ?months= months (3 to 24, default 6), grouped under each category's group. */
export function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const asked = Number(new URL(request.url).searchParams.get("months") ?? 6);
  const n = Number.isInteger(asked) ? Math.min(24, Math.max(3, asked)) : 6;
  const months = lastMonths(n);
  // "-31" works for every month: dates are compared as strings.
  const perMonth = months.map((m) => getCategoryBreakdown(workspaceId, `${m}-01`, `${m}-31`).map((c) => ({ categoryId: c.categoryId, name: c.name, color: c.color, amount: c.amount })));
  const categories = getAllCategories(workspaceId);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parentOf = new Map<number, PivotParent>();
  for (const c of categories) {
    const p = c.parentId != null ? byId.get(c.parentId) : undefined;
    if (p) parentOf.set(c.id, { id: p.id, name: p.name, color: p.color });
  }
  return NextResponse.json({ months, rows: buildPivot(months, perMonth, parentOf) });
}
