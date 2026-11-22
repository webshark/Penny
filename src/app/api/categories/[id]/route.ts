import { NextResponse } from "next/server";
import {
  deleteCategory,
  setCategoryParent,
  updateCategoryBudgetMode,
  updateCategoryDescription,
  updateCategoryLook,
  updateCategorySpendingType,
} from "@/server/db/queries/categories";
import type { CostType, NeedType } from "@/lib/types";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const MAX_DESCRIPTION_LENGTH = 500;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const typed = body as {
    budgetMode?: unknown;
    description?: unknown;
    parentId?: unknown;
    needType?: unknown;
    costType?: unknown;
    name?: unknown;
    color?: unknown;
  };

  let applied = false;

  if (typed.name !== undefined || typed.color !== undefined) {
    const name = typeof typed.name === "string" ? typed.name.trim() : undefined;
    if (typed.name !== undefined && (!name || name.length > 60)) {
      return NextResponse.json({ error: "name must be 1-60 characters" }, { status: 400 });
    }
    if (typed.color !== undefined && (typeof typed.color !== "string" || !/^#[0-9a-f]{6}$/i.test(typed.color))) {
      return NextResponse.json({ error: "color must be #rrggbb" }, { status: 400 });
    }
    const result = updateCategoryLook(workspaceId, categoryId, { name, color: typed.color as string | undefined });
    if (result === "not-found") return NextResponse.json({ error: "not found" }, { status: 404 });
    if (result === "duplicate") return NextResponse.json({ error: "duplicate" }, { status: 409 });
    applied = true;
  }

  if (typed.needType !== undefined || typed.costType !== undefined) {
    const needOk = typed.needType === undefined || ["need", "want", "saving"].includes(typed.needType as string);
    const costOk = typed.costType === undefined || ["fixed", "variable", "unplanned"].includes(typed.costType as string);
    if (!needOk || !costOk) {
      return NextResponse.json({ error: "invalid needType or costType" }, { status: 400 });
    }
    const ok = updateCategorySpendingType(workspaceId, categoryId, {
      needType: typed.needType as NeedType | undefined,
      costType: typed.costType as CostType | undefined,
    });
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.budgetMode !== undefined) {
    if (typed.budgetMode !== "budgeted" && typed.budgetMode !== "tracking") {
      return NextResponse.json(
        { error: "budgetMode must be 'budgeted' or 'tracking'" },
        { status: 400 }
      );
    }
    const ok = updateCategoryBudgetMode(workspaceId, categoryId, typed.budgetMode);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.description !== undefined) {
    if (typed.description !== null && typeof typed.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 }
      );
    }
    if (
      typeof typed.description === "string" &&
      typed.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return NextResponse.json(
        { error: `description must be ${MAX_DESCRIPTION_LENGTH} chars or fewer` },
        { status: 400 }
      );
    }
    const ok = updateCategoryDescription(
      workspaceId,
      categoryId,
      typed.description as string | null
    );
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.parentId !== undefined) {
    if (typed.parentId !== null && typeof typed.parentId !== "number") {
      return NextResponse.json(
        { error: "parentId must be a number or null" },
        { status: 400 }
      );
    }
    const result = setCategoryParent(
      workspaceId,
      categoryId,
      typed.parentId as number | null
    );
    if (!result.ok) {
      const status =
        result.reason === "not-found" || result.reason === "target-not-found"
          ? 404
          : 400;
      return NextResponse.json(
        { error: result.reason },
        { status }
      );
    }
    applied = true;
  }

  if (!applied) {
    return NextResponse.json(
      { error: "no recognized fields in body" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const result = deleteCategory(workspaceId, categoryId);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "has-children",
        message:
          "This category has subcategories. Delete each one before deleting this group.",
        children: result.children ?? [],
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedCategoryId: result.deletedCategoryId,
    unassignedTransactionCount: result.unassignedTransactionCount,
  });
}
