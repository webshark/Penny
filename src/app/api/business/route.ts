import { NextResponse } from "next/server";
import { getBusinessReport } from "@/server/db/queries/business";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { toCsv } from "@/lib/csv";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Default period: the last twelve months, ending today. */
function defaultRange(today = new Date()): { from: string; to: string } {
  const to = today.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  return { from: start.toISOString().slice(0, 10), to };
}

/** The business share of the ledger, as JSON or as a CSV for an accountant. */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const q = new URL(request.url).searchParams;
  const fallback = defaultRange();
  const from = ISO.test(q.get("from") ?? "") ? q.get("from")! : fallback.from;
  const to = ISO.test(q.get("to") ?? "") ? q.get("to")! : fallback.to;
  if (from > to) return NextResponse.json({ error: "from must be before to" }, { status: 400 });

  const report = getBusinessReport(workspaceId, from, to);
  if (q.get("format") !== "csv") return NextResponse.json(report);

  const csv = toCsv([
    ["תאריך", "תיאור", "חשבון", "קטגוריה", "סכום שחויב", "חלק עסקי", "אחוז עסקי"],
    ...report.rows.map((r) => [r.date, r.description, r.account, r.category, r.charged, r.business, r.pct]),
    [],
    ["סה\"כ", "", "", "", "", report.expenses - report.income, ""],
  ]);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="penny-business-${from}-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
