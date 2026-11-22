import "server-only";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { roundCents } from "@/lib/money";
import { isValidOwner, normalizeTag } from "@/lib/tags";
import { EditError } from "@/server/db/queries/transaction-edits";

/** Rows the user typed in (cash wallet or the add sheet). Everything else came from a bank/file and would return on the next sync. */
export const MANUAL_PROVIDERS = ["cash", "manual"];
export const isManualProvider = (provider: string) => MANUAL_PROVIDERS.includes(provider);

export type ManualInput = {
  kind?: unknown; amount?: unknown; date?: unknown; description?: unknown; categoryId?: unknown;
  account?: unknown; memo?: unknown; tags?: unknown; owner?: unknown; excluded?: unknown; businessSharePct?: unknown;
};
type Row = { id: number; provider: string; kind: string; account_number: string };

const MAX_AMOUNT = 10_000_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function check(db: Database.Database, ws: number, body: ManualInput, memberIds: string[]) {
  const out: { kind?: "expense" | "income"; amount?: number; date?: string; description?: string; categoryId?: number | null; account?: string; memo?: string | null; tags?: string[]; owner?: string | null; excluded?: boolean; businessSharePct?: number } = {};
  if (body.kind !== undefined) {
    if (body.kind !== "expense" && body.kind !== "income") throw new EditError("kind must be expense or income");
    out.kind = body.kind;
  }
  if (body.amount !== undefined) {
    const a = body.amount;
    if (typeof a !== "number" || !Number.isFinite(a) || a <= 0 || a > MAX_AMOUNT) throw new EditError("amount must be between 0 and 10,000,000");
    out.amount = roundCents(a);
    if (out.amount === 0) throw new EditError("amount must be at least 0.01");
  }
  if (body.date !== undefined) {
    const d = body.date;
    const parsed = typeof d === "string" && ISO.test(d) ? new Date(d + "T12:00:00Z") : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) throw new EditError("date must be YYYY-MM-DD");
    const year = parsed.getUTCFullYear();
    if (year < 1990 || parsed.getTime() > Date.now() + 366 * 86_400_000) throw new EditError("date is out of range");
    out.date = d as string;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim() || body.description.trim().length > 120) throw new EditError("description must be 1–120 characters");
    out.description = body.description.trim();
  }
  if (body.memo !== undefined) {
    if (body.memo !== null && (typeof body.memo !== "string" || body.memo.length > 500)) throw new EditError("notes must be up to 500 characters");
    out.memo = typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null;
  }
  if (body.categoryId !== undefined) {
    if (body.categoryId !== null && (!Number.isSafeInteger(body.categoryId) || (body.categoryId as number) <= 0)) throw new EditError("invalid category");
    out.categoryId = body.categoryId as number | null;
  }
  if (body.account !== undefined) {
    if (typeof body.account !== "string" || !body.account || body.account.length > 64) throw new EditError("invalid account");
    if (body.account !== "cash" && !db.prepare("SELECT 1 FROM transactions WHERE workspace_id=? AND account_number=? LIMIT 1").get(ws, body.account)) throw new EditError("unknown account");
    out.account = body.account;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 20) throw new EditError("tags must be a list of up to 20");
    const clean = body.tags.map(normalizeTag);
    if (clean.some(t => t == null)) throw new EditError("invalid tag");
    out.tags = [...new Set(clean as string[])];
  }
  if (body.owner !== undefined) {
    if (body.owner !== null && !isValidOwner(body.owner, memberIds)) throw new EditError("owner must be a household member or shared");
    out.owner = body.owner as string | null;
  }
  if (body.excluded !== undefined) {
    if (typeof body.excluded !== "boolean") throw new EditError("excluded must be true or false");
    out.excluded = body.excluded;
  }
  if (body.businessSharePct !== undefined) {
    const n = body.businessSharePct;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) throw new EditError("business share must be a whole percentage from 0 to 100");
    out.businessSharePct = n;
  }
  return out;
}

function assertCategory(db: Database.Database, ws: number, categoryId: number | null | undefined, kind: string) {
  if (categoryId == null) return;
  const c = db.prepare("SELECT kind FROM categories WHERE workspace_id=? AND id=? AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)").get(ws, categoryId) as { kind: string } | undefined;
  if (!c || c.kind !== kind) throw new EditError("Choose a matching category for this transaction");
}

function setTags(db: Database.Database, ws: number, id: number, tags: string[]) {
  db.prepare("DELETE FROM transaction_tags WHERE workspace_id=? AND transaction_id=?").run(ws, id);
  for (const tag of tags) db.prepare("INSERT OR IGNORE INTO transaction_tags (workspace_id, transaction_id, tag) VALUES (?,?,?)").run(ws, id, tag);
}

/** Placeholder sync run (sync_run_id is NOT NULL), dated 1970 so it never counts as the latest sync. */
function placeholderRun(db: Database.Database, ws: number, provider: string): number {
  const run = db.prepare("SELECT id FROM sync_runs WHERE workspace_id=? AND provider=? LIMIT 1").get(ws, provider) as { id: number } | undefined;
  if (run) return run.id;
  return Number(db.prepare("INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date) VALUES (?, ?, '1970-01-01', '1970-01-01', 'completed', '1970-01-01')").run(ws, provider).lastInsertRowid);
}

export function createManualTransaction(db: Database.Database, ws: number, body: ManualInput, memberIds: string[]): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new EditError("Invalid transaction");
  const f = check(db, ws, body, memberIds);
  if (!f.kind || f.amount === undefined || !f.date || !f.description) throw new EditError("kind, amount, date and description are required");
  assertCategory(db, ws, f.categoryId, f.kind);
  const account = f.account ?? "cash";
  const provider = account === "cash" ? "cash" : "manual";
  const signed = f.kind === "expense" ? -f.amount : f.amount;
  return db.transaction(() => {
    const credential = account === "cash" ? null : ((db.prepare("SELECT credential_id AS c FROM transactions WHERE workspace_id=? AND account_number=? AND credential_id IS NOT NULL LIMIT 1").get(ws, account) as { c: number } | undefined)?.c ?? null);
    const id = Number(db.prepare(
      `INSERT INTO transactions (workspace_id, account_number, date, processed_date, original_amount, original_currency, charged_amount, charged_currency,
         description, memo, type, status, provider, credential_id, sync_run_id, dedup_hash, kind, owner, category_id, category_source, is_excluded, business_share_pct)
       VALUES (?, ?, ?, ?, ?, 'ILS', ?, 'ILS', ?, ?, 'normal', 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ws, account, f.date, f.date, signed, signed, f.description, f.memo ?? null, provider, credential, placeholderRun(db, ws, provider),
      `${provider}:${randomUUID()}`, f.kind, f.owner ?? null, f.categoryId ?? null, f.categoryId == null ? null : "user", f.excluded ? 1 : 0, f.businessSharePct ?? 0).lastInsertRowid);
    if (f.tags?.length) setTags(db, ws, id, f.tags);
    return id;
  })();
}

/** Manual rows: every field. Bank/file rows: only what the next sync will not overwrite (no amount, date, kind or account). */
export function updateTransactionFields(db: Database.Database, ws: number, id: number, body: ManualInput, memberIds: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new EditError("Invalid transaction");
  const row = db.prepare("SELECT id, provider, kind, account_number FROM transactions WHERE workspace_id=? AND id=?").get(ws, id) as Row | undefined;
  if (!row) throw new EditError("Transaction not found", 404);
  const f = check(db, ws, body, memberIds);
  const manual = isManualProvider(row.provider);
  if (!manual && (f.amount !== undefined || f.date !== undefined || f.kind !== undefined || f.account !== undefined)) {
    throw new EditError("Amount, date, type and account of a bank transaction come from the bank", 403);
  }
  if (Object.keys(f).length === 0) throw new EditError("Nothing to change");
  const kind = f.kind ?? row.kind;
  if (f.categoryId !== undefined) assertCategory(db, ws, f.categoryId, kind);
  else if (f.kind && f.kind !== row.kind) f.categoryId = null; // the old category belongs to the other type
  db.transaction(() => {
    const sets: string[] = []; const vals: (string | number | null)[] = [];
    const put = (sql: string, v: string | number | null) => { sets.push(sql); vals.push(v); };
    if (f.description !== undefined) put("description=?", f.description);
    if (f.memo !== undefined) put("memo=?", f.memo);
    if (f.owner !== undefined) put("owner=?", f.owner);
    if (f.excluded !== undefined) put("is_excluded=?", f.excluded ? 1 : 0);
    if (f.businessSharePct !== undefined) put("business_share_pct=?", f.businessSharePct);
    if (f.categoryId !== undefined) { put("category_id=?", f.categoryId); put("category_source=?", f.categoryId == null ? null : "user"); put("needs_review=?", 0); }
    if (f.kind !== undefined) put("kind=?", f.kind);
    if (f.date !== undefined) { put("date=?", f.date); put("processed_date=?", f.date); }
    if (f.account !== undefined) { put("account_number=?", f.account); put("provider=?", f.account === "cash" ? "cash" : "manual"); }
    if (f.amount !== undefined || f.kind !== undefined) {
      const current = db.prepare("SELECT ABS(charged_amount) AS a FROM transactions WHERE id=?").get(id) as { a: number };
      const signed = (kind === "expense" ? -1 : 1) * (f.amount ?? current.a);
      put("charged_amount=?", signed); put("original_amount=?", signed);
    }
    if (sets.length) db.prepare(`UPDATE transactions SET ${sets.join(",")}, updated_at=datetime('now') WHERE workspace_id=? AND id=?`).run(...vals, ws, id);
    if (f.categoryId !== undefined || f.amount !== undefined) db.prepare("DELETE FROM transaction_allocations WHERE transaction_id=?").run(id); // a split no longer adds up
    if (f.tags) setTags(db, ws, id, f.tags);
  })();
}

/** Deletes a manual row and returns what is needed to re-create it (undo). Bank rows cannot be deleted: they would come back on the next sync. */
export function deleteManualTransaction(db: Database.Database, ws: number, id: number) {
  const row = db.prepare(
    `SELECT provider, kind, ABS(charged_amount) AS amount, substr(date,1,10) AS date, description, category_id AS categoryId, account_number AS account, memo, owner, is_excluded AS excluded, business_share_pct AS businessSharePct
     FROM transactions WHERE workspace_id=? AND id=?`
  ).get(ws, id) as { provider: string; excluded: number; [k: string]: unknown } | undefined;
  if (!row) throw new EditError("Transaction not found", 404);
  const { provider, excluded, ...rest } = row;
  if (!isManualProvider(provider)) throw new EditError("Bank transactions cannot be deleted; hide them instead", 403);
  const tags = (db.prepare("SELECT tag FROM transaction_tags WHERE workspace_id=? AND transaction_id=?").all(ws, id) as { tag: string }[]).map(t => t.tag);
  db.prepare("DELETE FROM transactions WHERE workspace_id=? AND id=?").run(ws, id);
  return { ...rest, excluded: !!excluded, tags };
}
