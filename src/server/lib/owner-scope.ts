import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The household member a request is scoped to.
 * Set once per request by a route; spend queries read it and add `ownerClause`, so callers don't thread it through.
 */
type Scope = { id: string; accounts: string[] };
const store = new AsyncLocalStorage<Scope | null>();

export const runWithOwner = <T>(scope: Scope | undefined, fn: () => T): T => store.run(scope ?? null, fn);

/**
 * ` AND <member matches>` plus its params; empty when unscoped. For a table or view with an owner column,
 * or (viaTransaction) a view with only transaction_id, such as v_spend_rows and v_cash_rows.
 */
export function ownerClause(alias = "", opts: { viaTransaction?: boolean } = {}): { sql: string; params: string[] } {
  const s = store.getStore();
  if (!s) return { sql: "", params: [] };
  const a = alias ? `${alias}.` : "";
  const owner = opts.viaTransaction ? `(SELECT ot.owner FROM transactions ot WHERE ot.id = ${a}transaction_id)` : `${a}owner`;
  const list = s.accounts.map(() => "?").join(",") || "NULL";
  return { sql: ` AND (${owner} = ? OR (${owner} IS NULL AND ${a}account_number IN (${list})))`, params: [s.id, ...s.accounts] };
}
