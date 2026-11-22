import { NextResponse } from "next/server";
import { ownerScopeFromParam } from "@/server/lib/account-owners";

import {
  queryTransactions,
  type TransactionKindFilter,
} from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

function parseKind(raw: string | null): TransactionKindFilter | undefined {
  if (raw === "expense" || raw === "income" || raw === "all") {
    return raw;
  }
  return undefined;
}

/** A query value that must be a whole number; anything else is treated as "not provided" (never trusted as SQL). */
function intParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  // Support multi-id filter ("?categoryIds=1&categoryIds=2") for parent
  // category drilldowns (parent expands to its children client-side).
  const categoryIds = searchParams
    .getAll("categoryIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  const credentialIds = searchParams
    .getAll("credentialIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const result = queryTransactions(workspaceId, {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    category: searchParams.has("category")
      ? intParam(searchParams.get("category"))
      : undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    sort: searchParams.get("sort") ?? undefined,
    order: (searchParams.get("order") as "asc" | "desc") ?? undefined,
    limit: intParam(searchParams.get("limit")),
    offset: intParam(searchParams.get("offset")),
    kind: parseKind(searchParams.get("kind")),
    provider: searchParams.get("provider") ?? undefined,
    credentialIds: credentialIds.length > 0 ? credentialIds : undefined,
    needsReview: searchParams.get("needsReview") === "1",
    tag: searchParams.get("tag") ?? undefined,
    owner: ownerScopeFromParam(workspaceId, searchParams.get("owner")),
    hiddenOnly: searchParams.get("hidden") === "1",
    accountNumber: searchParams.get("account")?.slice(0, 40) || undefined,
  });

  return NextResponse.json(result);
}
