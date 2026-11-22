import { NextResponse } from "next/server";
import { parsePensionReport } from "@/lib/pension-report";
import { importPensionReport, listPensionReports } from "@/server/pension/report";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({ reports: listPensionReports(getWorkspaceIdFromRequest(request)) });
}

/**
 * Body: the extracted report itself (docs/pension-report.md). Its products become assets with a
 * snapshot on the report date, its insurance becomes policies, and the header is kept in
 * pension_reports. A second import of the same report updates in place.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const report = parsePensionReport(body);
  if (typeof report === "string") return NextResponse.json({ error: report }, { status: 400 });
  return NextResponse.json(importPensionReport(getWorkspaceIdFromRequest(request), report));
}
