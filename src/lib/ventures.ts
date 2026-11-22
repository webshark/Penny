/** Private venture deals: SPVs, syndicates, fund deals. */
export const VENTURE_STATUSES = ["outstanding", "exited", "written_off"] as const;
export type VentureStatus = (typeof VENTURE_STATUSES)[number];

export interface Venture {
  id: string;
  name: string;
  platform: string;
  principal: number;
  entryFee: number;
  /** YYYY-MM-DD */
  date: string;
  status: VentureStatus;
  /** What came back on exit; ignored unless exited. */
  proceeds: number;
}

/** Keeps well-formed deals from stored data. */
export function parseVentures(raw: unknown): Venture[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  return raw.filter((v): v is Venture => !!v && typeof v.id === "string" && typeof v.name === "string" && v.name.trim() !== ""
    && typeof v.platform === "string" && num(v.principal) && v.principal > 0 && num(v.entryFee) && num(v.proceeds)
    && typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && (VENTURE_STATUSES as readonly unknown[]).includes(v.status)).slice(0, 100);
}

/** Invested (principal + fees), still outstanding, and the realized result of closed deals (exits minus cost, write-offs lost). */
export function ventureSummary(deals: Venture[]) {
  const cost = (d: Venture) => d.principal + d.entryFee;
  const invested = deals.reduce((s, d) => s + cost(d), 0);
  const outstanding = deals.filter((d) => d.status === "outstanding").reduce((s, d) => s + d.principal, 0);
  const realized = deals.reduce((s, d) => s + (d.status === "exited" ? d.proceeds - cost(d) : d.status === "written_off" ? -cost(d) : 0), 0);
  return { invested, outstanding, realized, count: deals.length };
}
