/** Credit utilization: what each card owes against the limit the person entered (banks don't send limits). */
export interface CardBalance { name: string; owed: number }

export function creditUtilization<T extends CardBalance>(cards: T[], limits: Record<string, number>) {
  const rows = cards.map((c) => {
    const limit = limits[c.name] > 0 ? limits[c.name] : null;
    const owed = Math.abs(c.owed);
    return { ...c, owed, limit, used: limit ? owed / limit : null };
  });
  const withLimit = rows.filter((r) => r.limit);
  const owed = withLimit.reduce((s, r) => s + r.owed, 0);
  const limit = withLimit.reduce((s, r) => s + (r.limit ?? 0), 0);
  return { rows, owed, limit, used: limit > 0 ? owed / limit : null, missing: rows.length - withLimit.length };
}

/** Keeps positive numeric limits keyed by card name; anything else in stored data is dropped. */
export function parseLimits(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => k.length <= 80 && typeof v === "number" && Number.isFinite(v) && v > 0));
}
