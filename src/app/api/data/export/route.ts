import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { toCsv } from "@/lib/csv";
import { toOfx, type OfxAccount } from "@/lib/ofx";
import { BANK_PROVIDERS } from "@/lib/types";

const HEADERS = [
  "date",
  "processed_date",
  "account",
  "provider",
  "description",
  "memo",
  "original_amount",
  "original_currency",
  "charged_amount",
  "charged_currency",
  "kind",
  "status",
  "category",
  "owner",
  "tags",
  // Every in-app total hides excluded rows, so the export has to say which ones they are.
  "excluded",
];

/** OFX for other money apps: completed rows that count in the totals, one statement per account. */
function ofx(workspaceId: number): NextResponse {
  const rows = getDb()
    .prepare(
      `SELECT id, date, charged_amount as amount, COALESCE(charged_currency, original_currency, 'ILS') as currency,
              description as name, memo, account_number as account, provider
       FROM transactions WHERE workspace_id = ? AND status = 'completed' AND is_excluded = 0 ORDER BY account_number, date, id`
    )
    .all(workspaceId) as { id: number; date: string; amount: number; currency: string; name: string; memo: string | null; account: string; provider: string }[];
  const cards = new Set<string>(BANK_PROVIDERS.filter((b) => b.kind === "card").map((b) => b.id));
  const accounts = new Map<string, OfxAccount>();
  for (const r of rows) {
    const key = `${r.provider}|${r.account}`;
    const a = accounts.get(key) ?? { number: r.account || r.provider, kind: cards.has(r.provider) ? "card" : "bank", currency: r.currency || "ILS", bank: r.provider, txns: [] };
    a.txns.push({ id: r.id, date: r.date, amount: r.amount, name: r.name, memo: r.memo });
    accounts.set(key, a);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toOfx([...accounts.values()], stamp), {
    headers: {
      "Content-Type": "application/x-ofx; charset=utf-8",
      "Content-Disposition": `attachment; filename="penny-transactions-${stamp}.ofx"`,
      "Cache-Control": "no-store",
    },
  });
}

/** All transactions of the workspace as a CSV download, or ?format=ofx for other money apps. */
export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (new URL(request.url).searchParams.get("format") === "ofx") return ofx(workspaceId);
  const rows = getDb()
    .prepare(
      `SELECT t.date, t.processed_date, t.account_number AS account, t.provider, t.description, t.memo,
              t.original_amount, t.original_currency, t.charged_amount, t.charged_currency,
              t.kind, t.status, COALESCE(c.name, '') as category, COALESCE(t.owner, '') as owner,
              (SELECT group_concat(tag, '|') FROM transaction_tags tt WHERE tt.transaction_id = t.id) as tags,
              t.is_excluded AS excluded
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ?
       ORDER BY t.date, t.id`
    )
    .all(workspaceId) as Record<string, unknown>[];

  const csv = toCsv([
    HEADERS,
    ...rows.map((row) => HEADERS.map((h) => row[h] as string | number | null)),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      // The BOM keeps Hebrew readable when Excel opens the file by double-click.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="penny-transactions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
