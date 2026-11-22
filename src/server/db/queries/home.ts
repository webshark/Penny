import "server-only";
import { DRIFT_TOLERANCE } from "@/lib/balance-drift";

import { ownerClause } from "@/server/lib/owner-scope";
import { getDb } from "../index";
import { toLocalISODate } from "../../lib/date-utils";
import { cashBetween } from "../../finance/facts";
import type {
  HomeBankHealthItem,
  HomeCashFlow,
  HomeCategoryBlock,
  HomeCategorySnapshotItem,
  HomeHistoricalTrendPoint,
  HomeNeedsAttention,
  HomeRecentTransaction,
  NeedType,
} from "@/lib/types";
import { BANK_PROVIDERS } from "@/lib/types";

export function getCashFlow(
  workspaceId: number,
  from: string,
  to: string
): HomeCashFlow {
  // One definition for the whole app: refunds reduce spending, transfers are neutral.
  const totals = cashBetween(workspaceId, from, to);
  return { income: totals.income, expenses: totals.spend, net: totals.net };
}

export function getHistoricalTrend(
  workspaceId: number,
  monthsBack: number
): HomeHistoricalTrendPoint[] {
  const db = getDb();
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: start.toLocaleDateString("en-US", { month: "short" }),
      from: toLocalISODate(start),
      to: toLocalISODate(end),
    });
  }

  const o = ownerClause("", { viaTransaction: true });
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(spend), 0) as total
     FROM v_spend_rows
     WHERE workspace_id = ? AND date >= ? AND date <= ?${o.sql}`
  );

  return months.map((m) => {
    const row = stmt.get(workspaceId, m.from, m.to, ...o.params) as { total: number };
    return {
      month: m.key,
      label: m.label,
      total: row.total,
      isCurrent: m.key === currentMonthKey,
    };
  });
}

export function getRecentTransactionsForHome(
  workspaceId: number,
  limit: number
): HomeRecentTransaction[] {
  const o = ownerClause("t");
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.date, t.description, t.charged_amount as chargedAmount,
              t.charged_currency as chargedCurrency, t.kind,
              c.name as categoryName, c.color as categoryColor,
              CASE WHEN t.kind = 'expense' THEN c.need_type END as needType
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.kind != 'transfer'
         AND t.is_excluded = 0${o.sql}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`
    )
    .all(workspaceId, ...o.params, limit) as Array<{
    id: number;
    date: string;
    description: string;
    chargedAmount: number;
    chargedCurrency: string | null;
    kind: "expense" | "income" | "transfer";
    categoryName: string | null;
    categoryColor: string | null;
    needType: NeedType | null;
  }>;
  return rows;
}

export function getNeedsAttentionCounts(
  workspaceId: number
): HomeNeedsAttention {
  const db = getDb();
  const uncategorized = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND category_id IS NULL AND kind = 'expense' AND status = 'completed'
         AND is_excluded = 0`
    )
    .get(workspaceId) as { count: number };
  const lowConfidence = db
    .prepare(
      // The prompt asks for a 1-7 confidence and the UI shows "n/7", so anything at or below 4 is weak.
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND ai_confidence IS NOT NULL AND ai_confidence <= 4
         AND category_source = 'ai' AND status = 'completed' AND is_excluded = 0`
    )
    .get(workspaceId) as { count: number };
  const flagged = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND needs_review = 1 AND status = 'completed' AND is_excluded = 0`
    )
    .get(workspaceId) as { count: number };
  return {
    uncategorized: uncategorized.count,
    lowConfidence: lowConfidence.count,
    flagged: flagged.count,
  };
}

export function getBankHealth(workspaceId: number): HomeBankHealthItem[] {
  const db = getDb();
  const creds = db
    .prepare(
      `SELECT id, provider, label FROM bank_credentials WHERE workspace_id = ? ORDER BY provider, id`
    )
    .all(workspaceId) as { id: number; provider: string; label: string }[];
  const perProvider = new Map<string, number>();
  for (const c of creds) perProvider.set(c.provider, (perProvider.get(c.provider) ?? 0) + 1);

  const latestRunStmt = db.prepare(
    `SELECT status, completed_at, error_message FROM sync_runs
     WHERE workspace_id = ? AND credential_id = ?
     ORDER BY started_at DESC, id DESC LIMIT 1`
  );

  const driftStmt = db.prepare(
    `SELECT drift FROM account_balances WHERE workspace_id = ? AND provider = ? AND ABS(drift) >= ? ORDER BY ABS(drift) DESC LIMIT 1`
  );
  const staleThresholdMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  return creds.map(({ id, provider, label: ownLabel }) => {
    const label = (perProvider.get(provider) ?? 0) > 1 ? ownLabel : null;
    const latest = latestRunStmt.get(workspaceId, id) as
      | { status: string; completed_at: string | null; error_message: string | null }
      | undefined;
    const providerInfo = BANK_PROVIDERS.find((p) => p.id === provider);
    const providerName = providerInfo?.name ?? provider;

    if (!latest) {
      return {
        id,
        provider,
        label,
        providerName,
        lastSyncAt: null,
        status: "never",
        errorMessage: null,
      };
    }

    if (latest.status === "failed") {
      return {
        id,
        provider,
        label,
        providerName,
        lastSyncAt: latest.completed_at,
        status: "error",
        errorMessage: latest.error_message,
      };
    }

    if (!latest.completed_at) {
      return {
        id,
        provider,
        label,
        providerName,
        lastSyncAt: null,
        status: "never",
        errorMessage: null,
      };
    }

    const ageMs = now - new Date(latest.completed_at + "Z").getTime();
    const status: "ok" | "stale" = ageMs > staleThresholdMs ? "stale" : "ok";
    return {
      id,
      provider,
      label,
      providerName,
      lastSyncAt: latest.completed_at,
      status,
      errorMessage: null,
      drift: (driftStmt.get(workspaceId, provider, DRIFT_TOLERANCE) as { drift: number } | undefined)?.drift ?? null,
    };
  });
}

export function getCategorySnapshot(
  workspaceId: number,
  from: string,
  to: string,
  limit: number
): HomeCategorySnapshotItem[] {
  const db = getDb();

  const categories = db
    .prepare(
      `SELECT id, parent_id as parentId, name, color
       FROM categories WHERE workspace_id = ? AND kind = 'expense'`
    )
    .all(workspaceId) as Array<{
    id: number;
    parentId: number | null;
    name: string;
    color: string;
  }>;

  const parentIds = new Set<number>();
  for (const c of categories) {
    if (c.parentId != null) parentIds.add(c.parentId);
  }

  const os = ownerClause("", { viaTransaction: true });
  const spendRows = db
    .prepare(
      `SELECT category_id as categoryId, SUM(spend) as amount
       FROM v_spend_rows
       WHERE workspace_id = ? AND date >= ? AND date <= ?
         AND category_id IS NOT NULL${os.sql}
       GROUP BY category_id`
    )
    .all(workspaceId, from, to, ...os.params) as Array<{ categoryId: number; amount: number }>;

  const budgetRows = db
    .prepare(
      `SELECT category_id as categoryId, monthly_amount as monthlyAmount
       FROM budgets WHERE workspace_id = ?`
    )
    .all(workspaceId) as Array<{ categoryId: number; monthlyAmount: number }>;

  const budgetByCategory = new Map<number, number>();
  for (const b of budgetRows) budgetByCategory.set(b.categoryId, b.monthlyAmount);

  // Roll each leaf's spend up to its parent if it has one, else under its own id.
  const rolledSpend = new Map<number, number>();
  const rolledBudget = new Map<number, number>();

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  for (const row of spendRows) {
    const cat = categoryById.get(row.categoryId);
    if (!cat) continue;
    const key = cat.parentId ?? cat.id;
    rolledSpend.set(key, (rolledSpend.get(key) ?? 0) + row.amount);
  }

  // Roll up budgets the same way. Parent's explicit budget takes precedence
  // over the sum of children when it exists.
  for (const cat of categories) {
    const explicit = budgetByCategory.get(cat.id);
    if (explicit == null) continue;
    const key = cat.parentId ?? cat.id;
    if (cat.parentId == null && parentIds.has(cat.id)) {
      // This is a parent with its own explicit budget — use it directly.
      rolledBudget.set(key, explicit);
    } else {
      // Leaf budget: only add if parent doesn't have its own explicit budget.
      const parentHasOwnBudget =
        cat.parentId != null && budgetByCategory.has(cat.parentId);
      if (parentHasOwnBudget) continue;
      rolledBudget.set(key, (rolledBudget.get(key) ?? 0) + explicit);
    }
  }

  const items: HomeCategorySnapshotItem[] = [];
  for (const [key, spent] of rolledSpend) {
    const cat = categoryById.get(key);
    if (!cat) continue;
    const budget = rolledBudget.get(key) ?? 0;
    items.push({
      categoryId: key,
      name: cat.name,
      color: cat.color,
      spent,
      budget,
      percentSpent: budget > 0 ? (spent / budget) * 100 : 0,
    });
  }

  items.sort((a, b) => b.spent - a.spent);
  return items.slice(0, limit);
}

/** Every expense category with spend this month (rolled up to parents), for the Home category scroll. */
export function getCategoryScroll(
  workspaceId: number,
  from: string,
  to: string,
  trendMonths: number
): HomeCategoryBlock[] {
  const db = getDb();
  // Month keys ending at `from`'s month, oldest first.
  const [y, m] = from.split("-").map(Number);
  const months = Array.from({ length: trendMonths }, (_, i) => {
    const d = new Date(y, m - 1 - (trendMonths - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const trendFrom = `${months[0]}-01`;
  const snapshot = getCategorySnapshot(workspaceId, from, to, Number.MAX_SAFE_INTEGER);
  const icons = new Map(
    (db
      .prepare("SELECT id, icon FROM categories WHERE workspace_id = ?")
      .all(workspaceId) as Array<{ id: number; icon: string | null }>).map((r) => [r.id, r.icon])
  );
  const ot = ownerClause("t", { viaTransaction: true });
  const where = `t.workspace_id = ? AND t.date >= ? AND t.date <= ?${ot.sql}`;
  const trendRows = db
    .prepare(
      `SELECT COALESCE(c.parent_id, c.id) as key, substr(t.date, 1, 7) as month, SUM(t.spend) as amount
       FROM v_spend_rows t JOIN categories c ON c.id = t.category_id
       WHERE ${where} GROUP BY key, month`
    )
    .all(workspaceId, trendFrom, to, ...ot.params) as Array<{ key: number; month: string; amount: number }>;
  const merchantRows = db
    .prepare(
      `SELECT /* merchant name comes from the transaction, the spend view has none */ COALESCE(c.parent_id, c.id) as key, source.description as merchant, SUM(t.spend) as amount
       FROM v_spend_rows t JOIN categories c ON c.id = t.category_id
       JOIN transactions source ON source.id = t.transaction_id AND source.workspace_id = t.workspace_id
       WHERE ${where} GROUP BY key, merchant ORDER BY amount DESC`
    )
    .all(workspaceId, from, to, ...ot.params) as Array<{ key: number; merchant: string; amount: number }>;

  return snapshot.map((c) => {
    const byMonth = new Map(trendRows.filter((r) => r.key === c.categoryId).map((r) => [r.month, r.amount]));
    return {
      ...c,
      icon: icons.get(c.categoryId) ?? null,
      trend: months.map((m) => byMonth.get(m) ?? 0),
      topMerchants: merchantRows
        .filter((r) => r.key === c.categoryId)
        .slice(0, 3)
        .map(({ merchant, amount }) => ({ merchant, amount })),
    };
  });
}
