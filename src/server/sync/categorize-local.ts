import "server-only";

import { getAllCategories } from "@/server/db/queries/categories";
import { batchUpdateCategories, getTransactionsForCategorization, getUncategorizedIdsByKind } from "@/server/db/queries/transactions";
import { incrementMerchantHits, lookupMerchantCategoriesBulk, normalizeMerchant } from "@/server/lib/merchant-memory";
import { dictionaryCategory } from "@/lib/merchant-dictionary";

/**
 * Categorizes without AI, on every sync: first what this household already taught (a merchant it categorized before),
 * then the built-in dictionary of Israeli merchants. AI, when connected, only sees what is left.
 */
export function categorizeLocally(workspaceId: number): number {
  let done = 0;
  for (const kind of ["expense", "income"] as const) {
    const ids = getUncategorizedIdsByKind(workspaceId, kind);
    if (ids.length === 0) continue;
    // The dictionary names leaf categories; a household that renamed or removed one simply gets no match.
    const byName = new Map(getAllCategories(workspaceId, kind, { leavesOnly: true }).map((c) => [c.name, c.id]));
    const txns = getTransactionsForCategorization(workspaceId, ids);
    const memory = lookupMerchantCategoriesBulk(workspaceId, txns.map((t) => t.description));
    const updates: { id: number; categoryId: number }[] = [];
    const learned: string[] = [];
    for (const t of txns) {
      const m = memory.get(t.description);
      if (m && m.kind === kind) {
        updates.push({ id: t.id, categoryId: m.categoryId });
        learned.push(normalizeMerchant(t.description));
        continue;
      }
      const name = dictionaryCategory(t.description, kind);
      const categoryId = name ? byName.get(name) : undefined;
      if (categoryId) updates.push({ id: t.id, categoryId });
    }
    if (updates.length === 0) continue;
    batchUpdateCategories(workspaceId, updates);
    if (learned.length) incrementMerchantHits(workspaceId, learned);
    done += updates.length;
  }
  return done;
}
