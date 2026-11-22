import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { lookupMerchantCategoriesBulk } from "@/server/lib/merchant-memory";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { MAX_SHEET_ROWS } from "@/lib/sheet-import";

/** Category names for ids the merchant memory returned. */
function namesByIds(workspaceId: number, ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const rows = getDb()
    .prepare(`SELECT id, name FROM categories WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
    .all(workspaceId, ...ids) as { id: number; name: string }[];
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Suggests a category per row from merchant memory (what the user chose for this merchant before).
 * Never writes anything: the card shows the suggestion as a chip the user accepts.
 */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = ((await request.json().catch(() => null)) ?? {}) as { rows?: unknown };
  if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ suggestions: [] });
  if (body.rows.length > MAX_SHEET_ROWS) return NextResponse.json({ error: "too many rows" }, { status: 400 });

  const rows = body.rows as { description?: unknown; kind?: unknown }[];
  const descriptions = rows.map((r) => (typeof r?.description === "string" ? r.description : "")).filter(Boolean);
  const found = lookupMerchantCategoriesBulk(workspaceId, descriptions);
  const names = namesByIds(workspaceId, [...new Set([...found.values()].map((m) => m.categoryId))]);

  const suggestions = rows.flatMap((r, index) => {
    const description = typeof r?.description === "string" ? r.description : "";
    const kind = r?.kind === "income" ? "income" : "expense";
    const match = found.get(description);
    if (!match || match.kind !== kind) return [];
    const name = names.get(match.categoryId);
    return name ? [{ index, categoryId: match.categoryId, name, kind }] : [];
  });
  return NextResponse.json({ suggestions });
}
