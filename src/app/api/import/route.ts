import { NextResponse } from "next/server";
import { deleteFileImport } from "@/server/db/queries/transactions";
import { saveStatementImport } from "@/server/lib/folder-import";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { MAX_IMPORT_ROWS, parseImportDate, type ImportRow } from "@/lib/file-import";
import { roundCents } from "@/lib/money";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Imports parsed statement rows: { account, rows: [{date, description, amount}], dryRun? }.
 * Rows already stored for that account are skipped. dryRun only counts.
 */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = ((await request.json().catch(() => null)) ?? {}) as { account?: unknown; rows?: unknown; dryRun?: unknown; source?: unknown };
  const account = typeof body.account === "string" ? body.account.trim().slice(0, 40) : "";
  if (!account) return bad("account is required");
  if (!Array.isArray(body.rows) || body.rows.length === 0) return bad("rows are required");
  if (body.rows.length > MAX_IMPORT_ROWS) return bad(`at most ${MAX_IMPORT_ROWS} rows`);
  const rows: ImportRow[] = [];
  for (const r of body.rows as Record<string, unknown>[]) {
    const date = typeof r?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? parseImportDate(r.date) : null;
    const amount = r?.amount;
    const description = typeof r?.description === "string" ? r.description.trim().slice(0, 200) : "";
    if (!date || date > "2100-01-01" || date < "1990-01-01") return bad("invalid date");
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e8) return bad("invalid amount");
    if (!description) return bad("invalid description");
    rows.push({ date, description, amount: roundCents(amount) });
  }
  const source = body.source === "card" ? "card" : "bank";
  return NextResponse.json(saveStatementImport(workspaceId, account, rows, body.dryRun === true, source));
}

/** Undo one import: ?batch=. */
export async function DELETE(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const batch = Number(new URL(request.url).searchParams.get("batch"));
  if (!Number.isInteger(batch) || batch <= 0) return bad("invalid batch");
  return NextResponse.json({ removed: deleteFileImport(workspaceId, batch) });
}
