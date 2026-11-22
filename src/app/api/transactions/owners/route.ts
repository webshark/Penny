import { NextResponse } from "next/server";
import { getAccountNumbers, getOwnerRows } from "@/server/db/queries/transactions";
import { getAppSettings, setWorkspaceSetting } from "@/server/db/queries/settings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isValidOwner, ownerSummary } from "@/lib/tags";
import { readAccountOwners } from "@/server/lib/account-owners";

const KEY = "account_owners";


const memberIdsOf = (workspaceId: number) => getAppSettings(workspaceId).household.members.map((m) => m.id);

/** Owner summary for ?from&to, the default owner per account, and the accounts to pick from. */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const q = new URL(request.url).searchParams;
  const members = getAppSettings(workspaceId).household.members;
  const memberIds = members.map((m) => m.id);
  const accountOwners = readAccountOwners(workspaceId, memberIds);
  const rows = getOwnerRows(workspaceId, q.get("from") ?? "0000", q.get("to") ?? "9999");
  return NextResponse.json({
    accountOwners,
    accounts: getAccountNumbers(workspaceId),
    summary: ownerSummary(rows, accountOwners, memberIds, members.filter((m) => m.role !== "child").map((m) => m.id)),
  });
}

/** Sets (or clears, with owner null) the default owner of one account: { accountNumber, owner }. */
export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = ((await request.json().catch(() => null)) ?? {}) as { accountNumber?: unknown; owner?: unknown };
  const memberIds = memberIdsOf(workspaceId);
  if (typeof body.accountNumber !== "string" || body.accountNumber.length === 0 || body.accountNumber.length > 64) {
    return NextResponse.json({ error: "accountNumber is required" }, { status: 400 });
  }
  if (body.owner !== null && !isValidOwner(body.owner, memberIds)) {
    return NextResponse.json({ error: "owner must be a household member, shared, or null" }, { status: 400 });
  }
  const next = { ...readAccountOwners(workspaceId, memberIds) };
  if (body.owner === null) delete next[body.accountNumber];
  else next[body.accountNumber] = body.owner;
  setWorkspaceSetting(workspaceId, KEY, JSON.stringify(next));
  return NextResponse.json({ accountOwners: next });
}
