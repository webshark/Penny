import "server-only";
import { getAppSettings, getWorkspaceSetting } from "@/server/db/queries/settings";
import { isValidOwner, type AccountOwners } from "@/lib/tags";

/** Default owner per account number, dropping owners who are no longer household members. */
export function readAccountOwners(workspaceId: number, memberIds: string[]): AccountOwners {
  try {
    const raw = JSON.parse(getWorkspaceSetting(workspaceId, "account_owners") ?? "{}") as Record<string, unknown>;
    // Drop owners of members who were removed from the household.
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => isValidOwner(v, memberIds))) as AccountOwners;
  } catch {
    return {};
  }
}

/** The accounts whose default owner is this member, for filtering rows by member. */
export function accountsOwnedBy(workspaceId: number, memberIds: string[], memberId: string): string[] {
  return Object.entries(readAccountOwners(workspaceId, memberIds)).filter(([, owner]) => owner === memberId).map(([account]) => account);
}

/** ?owner= a household member id (or "shared") as a filter scope; anything else is ignored rather than trusted. */
export function ownerScopeFromParam(workspaceId: number, raw: string | null): { id: string; accounts: string[] } | undefined {
  if (!raw) return undefined;
  const memberIds = getAppSettings(workspaceId).household.members.map((m) => m.id);
  if (!isValidOwner(raw, memberIds)) return undefined;
  return { id: raw, accounts: accountsOwnedBy(workspaceId, memberIds, raw) };
}
