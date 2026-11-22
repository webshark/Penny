/** Spending trackers: chosen categories over a date range, against a limit. */
export interface Tracker {
  id: string;
  name: string;
  categoryIds: number[];
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  limit: number;
}

export interface TrackerRow { categoryId: number; parentId: number | null; spent: number }

/** Keeps only well-formed trackers from stored data. */
export function parseTrackers(raw: unknown): Tracker[] {
  if (!Array.isArray(raw)) return [];
  const day = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return raw.filter((t): t is Tracker =>
    !!t && typeof t.id === "string" && typeof t.name === "string" && t.name.trim() !== "" &&
    Array.isArray(t.categoryIds) && t.categoryIds.every((n: unknown) => Number.isInteger(n)) &&
    day(t.from) && day(t.to) && t.from <= t.to && typeof t.limit === "number" && t.limit > 0).slice(0, 50);
}

/**
 * Spent, share of the limit and where the tracker stands on `today`.
 * A chosen parent already includes its children, so a child is counted only when its parent is not chosen.
 */
export function trackerStatus(t: Tracker, rows: TrackerRow[], today: string) {
  const chosen = new Set(t.categoryIds);
  const spent = rows.filter((r) => chosen.has(r.categoryId) && !(r.parentId != null && chosen.has(r.parentId))).reduce((s, r) => s + r.spent, 0);
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const state = today < t.from ? "upcoming" : today > t.to ? "ended" : "active";
  return {
    spent,
    used: spent / t.limit,
    over: spent > t.limit,
    state: state as "upcoming" | "active" | "ended",
    /** Days left including today, while active. */
    daysLeft: state === "active" ? days(today, t.to) + 1 : 0,
  };
}
