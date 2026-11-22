import { NextResponse } from "next/server";
import {
  createParentCategory,
  ensureCategory,
  getAllCategories,
  getCategoryById,
  getCategoryByName,
} from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { CategoryKind } from "@/lib/types";

import { errorResponse } from "@/server/lib/api-error";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("kind");
  const kind: CategoryKind | undefined =
    raw === "expense" || raw === "income" ? raw : undefined;
  const leavesOnly = searchParams.get("leavesOnly") === "1";
  return NextResponse.json(
    getAllCategories(workspaceId, kind, { leavesOnly })
  );
}

interface CreateBody {
  name?: unknown;
  kind?: unknown;
  isParent?: unknown;
  icon?: unknown;
  description?: unknown;
  color?: unknown;
  parentId?: unknown;
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: CreateBody;
  try {
    body = ((await request.json()) ?? {}) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }
  if (body.kind !== "expense" && body.kind !== "income") {
    return NextResponse.json(
      { error: "kind must be 'expense' or 'income'" },
      { status: 400 }
    );
  }
  const name = body.name.trim();
  if (name.length > 40) {
    return NextResponse.json({ error: "name is too long" }, { status: 400 });
  }
  if (getCategoryByName(workspaceId, name)) {
    return NextResponse.json(
      { error: "a category with this name already exists", code: "duplicate-name" },
      { status: 409 }
    );
  }
  const icon =
    typeof body.icon === "string" && /^[a-z0-9-]{1,40}$/.test(body.icon)
      ? body.icon
      : undefined;
  const color =
    typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)
      ? body.color
      : undefined;
  let parentId: number | null = null;
  if (body.parentId != null) {
    const parent =
      typeof body.parentId === "number"
        ? getCategoryById(workspaceId, body.parentId)
        : null;
    if (!parent || parent.parentId !== null || parent.kind !== body.kind) {
      return NextResponse.json({ error: "invalid parent" }, { status: 400 });
    }
    parentId = parent.id;
  }
  const description =
    typeof body.description === "string" ? body.description : null;

  try {
    if (body.isParent === true || color || parentId !== null) {
      const cat = createParentCategory(workspaceId, {
        name,
        kind: body.kind,
        icon,
        color,
        description,
        parentId,
      });
      return NextResponse.json(cat, { status: 201 });
    }
    const cat = ensureCategory(workspaceId, name, icon, body.kind);
    return NextResponse.json(cat, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "a category with this name already exists", code: "duplicate-name" },
        { status: 409 }
      );
    }
    return errorResponse("categories", err);
  }
}
