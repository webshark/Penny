import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";
import { normalizeMerchant } from "@/server/lib/merchant-memory";
import { explainChange } from "@/lib/spend-change";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
/** The same days (1st to `day`) of the month `back` months before y-m, clamped to that month's length. */
function window(y: number, m: number, day: number, back: number): [string, string] {
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const ym = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  return [`${ym}-01`, `${ym}-${pad(Math.min(day, last))}`];
}

/** ?compare=month (default) or year: this month so far against the same days of last month, or of this month last year. */
export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const compare = new URL(request.url).searchParams.get("compare") === "year" ? "year" : "month";
  const today = israelToday();
  const [y, m, day] = today.split("-").map(Number);
  const now = window(y, m, day, 0);
  const before = window(y, m, day, compare === "year" ? 12 : 1);
  const stmt = getDb().prepare(
    `SELECT description, -charged_amount AS amount FROM transactions
     WHERE workspace_id = ? AND kind = 'expense' AND status = 'completed' AND is_excluded = 0
       AND flow_type IN ('expense', 'refund') AND date >= ? AND date <= ?`
  );
  // Grouped by the normalized merchant; shown with the name as it most often appears.
  const names = new Map<string, Map<string, number>>();
  const rows = (range: [string, string]) =>
    (stmt.all(ws, ...range) as { description: string; amount: number }[]).map((r) => {
      const key = normalizeMerchant(r.description) || r.description;
      const seen = names.get(key) ?? new Map<string, number>();
      seen.set(r.description, (seen.get(r.description) ?? 0) + 1);
      names.set(key, seen);
      return { merchant: key, amount: r.amount };
    });
  const result = explainChange(rows(before), rows(now));
  const display = (key: string) => [...(names.get(key) ?? new Map([[key, 1]]))].sort((a, b) => b[1] - a[1])[0][0];
  return NextResponse.json({
    compare,
    now: { from: now[0], to: now[1], total: result.now },
    before: { from: before[0], to: before[1], total: result.before },
    change: result.change,
    hasHistory: result.before > 0,
    drivers: result.drivers.map((d) => ({ ...d, merchant: display(d.merchant) })),
  });
}
