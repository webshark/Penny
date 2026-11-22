import type { Asset } from "./types";

export const ACCOUNT_GROUPS = ["bank", "investments", "property", "vehicles", "other", "liabilities"] as const;
export type AccountGroupKey = typeof ACCOUNT_GROUPS[number];

const INVESTMENT = new Set(["stock", "fund", "bond", "crypto", "metal", "study_fund", "provident", "pension"]);

export function accountGroupOf(a: Pick<Asset, "type" | "isLiability" | "source">): AccountGroupKey {
  if (a.isLiability) return "liabilities";
  if (a.source === "bank" || a.type === "cash" || a.type === "deposit") return "bank";
  if (INVESTMENT.has(a.type)) return "investments";
  if (a.type === "real_estate" || a.type === "business") return "property";
  if (a.type === "vehicle") return "vehicles";
  return "other";
}

/** Accounts sorted into the sidebar's groups, biggest first; liabilities total is negative. Empty groups are left out.
 * `moves` puts an account (by id) in a group of the person's choice; a debt always stays a debt. */
export function groupAccounts(assets: Asset[], moves: Record<number, AccountGroupKey> = {}) {
  return ACCOUNT_GROUPS.map((key) => {
    const items = assets
      .filter((a) => (a.isLiability ? "liabilities" : (moves[a.id] !== "liabilities" && moves[a.id]) || accountGroupOf(a)) === key)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, value: (key === "liabilities" ? -1 : 1) * Math.abs(a.valueIls ?? 0) }))
      .sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    return { key, items, total: items.reduce((s, x) => s + x.value, 0) };
  }).filter((g) => g.items.length > 0);
}
