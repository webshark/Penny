import "server-only";

import type { PlannedInput } from "@/server/db/queries/planned";
import { PLANNED_STATUSES, type PlannedStatus } from "@/lib/planned";

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Validates the planned-expense form. Returns a message in English or the clean input. */
export function parsePlannedInput(body: unknown): PlannedInput | string {
  const item = (body ?? {}) as Record<string, unknown>;
  const id = item.id == null ? undefined : Number(item.id);
  if (id !== undefined && !Number.isInteger(id)) return "invalid id";

  const description = text(item.description, 80);
  if (!description) return "a planned expense needs a description";
  const amount = Number(item.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) return "amount must be a positive number";
  const date = day(item.date);
  if (!date) return "date must be YYYY-MM-DD";
  const installments = item.installments == null || item.installments === "" ? 1 : Number(item.installments);
  if (!Number.isInteger(installments) || installments < 1 || installments > 60) return "installments must be 1 to 60";

  const status = item.status == null || item.status === "" ? undefined : (item.status as PlannedStatus);
  if (status !== undefined && !PLANNED_STATUSES.includes(status)) return "unknown status";

  const categoryId = item.categoryId == null || item.categoryId === "" ? null : Number(item.categoryId);
  if (categoryId !== null && !Number.isInteger(categoryId)) return "invalid category";

  return {
    id,
    description,
    amount: Math.round(amount * 100) / 100,
    date,
    account: text(item.account, 60),
    installments,
    matchPattern: text(item.matchPattern, 60),
    categoryId,
    owner: text(item.owner, 40),
    notes: text(item.notes, 500),
    status,
  };
}
