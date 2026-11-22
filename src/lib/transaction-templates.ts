/** Transaction templates: a saved manual entry (rent in cash, the weekly market) that fills the add form in one tap. */
export interface TxnTemplate {
  id: string;
  description: string;
  kind: "expense" | "income";
  amount: number;
  categoryId: number | null;
  account: string;
  owner: string | null;
}

export const MAX_TEMPLATES = 12;

/** Keeps well-formed templates from stored data. */
export function parseTemplates(raw: unknown): TxnTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is TxnTemplate => !!v && typeof v.id === "string" && typeof v.description === "string" && v.description.trim() !== ""
    && (v.kind === "expense" || v.kind === "income") && typeof v.amount === "number" && Number.isFinite(v.amount) && v.amount > 0
    && (v.categoryId === null || Number.isInteger(v.categoryId)) && typeof v.account === "string"
    && (v.owner === null || typeof v.owner === "string")).slice(0, MAX_TEMPLATES);
}

/** Adds a template, replacing one with the same description and kind, newest first. */
export function upsertTemplate(list: TxnTemplate[], next: TxnTemplate): TxnTemplate[] {
  const same = (t: TxnTemplate) => t.kind === next.kind && t.description.trim() === next.description.trim();
  return [next, ...list.filter((t) => !same(t))].slice(0, MAX_TEMPLATES);
}
