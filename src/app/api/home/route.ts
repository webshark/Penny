import { NextResponse } from "next/server";
import {
  getPeriodTotal,
  getTopMerchants,
} from "@/server/db/queries/transactions";
import {
  getBankHealth,
  getCashFlow,
  getCategoryScroll,
  getCategorySnapshot,
  getHistoricalTrend,
  getNeedsAttentionCounts,
  getRecentTransactionsForHome,
} from "@/server/db/queries/home";
import { getWorkspaceSetting } from "@/server/db/queries/settings";
import { getNextRunAt } from "@/server/sync/scheduler";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { ownerScopeFromParam } from "@/server/lib/account-owners";
import { runWithOwner } from "@/server/lib/owner-scope";
import {
  daysInMonth,
  dayWithinMonth,
  daysUntil,
  nextPayday,
  pacePhrase,
} from "@/server/lib/pace";
import { israelToday, toLocalISODate } from "@/server/lib/date-utils";
import { homeMonthDate } from "@/lib/home-month";
import type {
  HomeBankHealthItem,
  HomeCashFlow,
  HomeCategoryBlock,
  HomeCategorySnapshotItem,
  HomeHistoricalTrendPoint,
  HomeNeedsAttention,
  HomePayload,
  HomeRecentTransaction,
  HomeSection,
  HomeSectionError,
  HomeThisMonth,
  HomeTopMerchant,
} from "@/lib/types";

const HISTORICAL_MONTHS = 8;
const RECENT_TXN_LIMIT = 8;
const TOP_MERCHANT_LIMIT = 6;
const CATEGORY_SNAPSHOT_LIMIT = 6;
const CATEGORY_TREND_MONTHS = 6;

function safe<T>(
  section: HomeSection,
  errors: HomeSectionError[],
  fn: () => T
): T | null {
  try {
    return fn();
  } catch (err) {
    errors.push({
      section,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** ?owner= scopes the dashboard's spend and cash figures to one household member. */
export async function GET(request: Request) {
  const scope = ownerScopeFromParam(getWorkspaceIdFromRequest(request), new URL(request.url).searchParams.get("owner"));
  return runWithOwner(scope, () => home(request));
}

async function home(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  // Israel's calendar day as a local date, so the month is right on a host in another time zone (Docker runs UTC).
  const [ty, tm, td] = israelToday().split("-").map(Number);
  const today = new Date(ty, tm - 1, td, 12);
  const now = homeMonthDate(new URL(request.url).searchParams.get("month"), today);
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const from = toLocalISODate(monthStart);
  const to = toLocalISODate(monthEnd);
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long" });

  const totalDays = daysInMonth(year, month);
  const elapsedDays = Math.max(1, dayWithinMonth(now, year, month));
  const timeElapsedPercent = Math.min(100, (elapsedDays / totalDays) * 100);

  const paydayDay = Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1");
  const payday = nextPayday(now, paydayDay);
  const daysUntilPayday = Math.max(0, daysUntil(payday));

  const errors: HomeSectionError[] = [];

  const thisMonth = safe<HomeThisMonth>("thisMonth", errors, () => {
    const spent = getPeriodTotal(workspaceId, from, to);
    const monthlyTargetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
    const parsed = monthlyTargetRaw != null ? Number(monthlyTargetRaw) : NaN;
    const budget = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

    // Same window last month: from day 1 to today's day-of-month (clamped).
    const prevMonthStart = new Date(year, month - 1, 1);
    const prevElapsedDay = Math.min(
      elapsedDays,
      daysInMonth(prevMonthStart.getFullYear(), prevMonthStart.getMonth())
    );
    const prevMonthMtdEnd = new Date(
      prevMonthStart.getFullYear(),
      prevMonthStart.getMonth(),
      prevElapsedDay
    );
    const prevSpent = getPeriodTotal(
      workspaceId,
      toLocalISODate(prevMonthStart),
      toLocalISODate(prevMonthMtdEnd)
    );
    const deltaVsLastMonth =
      prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;

    const phrase = pacePhrase(spent, spent, budget, timeElapsedPercent, monthLabel);

    return {
      spent,
      budget,
      deltaVsLastMonth,
      pacePhrase: phrase,
      daysUntilPayday,
      timeElapsedPercent,
      monthLabel,
    };
  });

  const cashFlow = safe<HomeCashFlow>("cashFlow", errors, () =>
    getCashFlow(workspaceId, from, to)
  );

  const categorySnapshot = safe<HomeCategorySnapshotItem[]>(
    "categorySnapshot",
    errors,
    () => getCategorySnapshot(workspaceId, from, to, CATEGORY_SNAPSHOT_LIMIT)
  );

  const historicalTrend = safe<HomeHistoricalTrendPoint[]>(
    "historicalTrend",
    errors,
    () => getHistoricalTrend(workspaceId, HISTORICAL_MONTHS)
  );

  const recentTransactions = safe<HomeRecentTransaction[]>(
    "recentTransactions",
    errors,
    () => getRecentTransactionsForHome(workspaceId, RECENT_TXN_LIMIT)
  );

  const topMerchants = safe<HomeTopMerchant[]>("topMerchants", errors, () => {
    const rows = getTopMerchants(workspaceId, from, to, TOP_MERCHANT_LIMIT);
    return rows.map((m) => ({
      name: m.name,
      total: m.amount,
      count: m.count,
    }));
  });

  const needsAttention = safe<HomeNeedsAttention>(
    "needsAttention",
    errors,
    () => getNeedsAttentionCounts(workspaceId)
  );

  const bankHealth = safe<HomeBankHealthItem[]>("bankHealth", errors, () =>
    getBankHealth(workspaceId)
  );

  const categories = safe<HomeCategoryBlock[]>("categories", errors, () =>
    getCategoryScroll(workspaceId, from, to, CATEGORY_TREND_MONTHS)
  );

  const payload: HomePayload = {
    thisMonth,
    cashFlow,
    categorySnapshot,
    historicalTrend,
    recentTransactions,
    topMerchants,
    needsAttention,
    bankHealth,
    categories,
    nextScheduledSync: getNextRunAt(),
    errors,
  };

  return NextResponse.json(payload);
}
