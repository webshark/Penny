import { ASSET_TYPES, LIABILITY_TYPES, type AssetInput } from "./types";

const TYPES: readonly string[] = [...ASSET_TYPES, ...LIABILITY_TYPES];
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Validate an asset from a request body or CSV row. Returns the clean input, or an error message. */
export function parseAssetInput(raw: unknown): AssetInput | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
  if (!name) return "name is required";
  if (typeof r.type !== "string" || !TYPES.includes(r.type)) return `invalid type for ${name}`;
  const currency = typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : "ILS";
  const symbol = typeof r.symbol === "string" && r.symbol.trim() ? r.symbol.trim().toUpperCase().slice(0, 20) : null;
  const quantity = num(r.quantity);
  const manualValue = num(r.manualValue);
  const costBasis = num(r.costBasis);
  const costFx = currency === "ILS" ? null : num(r.costFx);
  const extra = {
    feeDeposit: num(r.feeDeposit),
    feeBalance: num(r.feeBalance),
    monthlyDeposit: num(r.monthlyDeposit),
    interestRate: num(r.interestRate),
    monthlyPayment: num(r.monthlyPayment),
  };
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  // Home details, only on real estate.
  const home = r.type === "real_estate"
    ? {
        city: str(r.city, 60),
        street: str(r.street, 80),
        rooms: num(r.rooms),
        sizeM2: num(r.sizeM2),
        purchasePrice: num(r.purchasePrice),
        purchaseMonth: typeof r.purchaseMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.purchaseMonth) ? r.purchaseMonth : null,
      }
    : r.type === "study_fund"
      // A study fund's opening month: it decides when the money becomes liquid.
      ? { purchaseMonth: typeof r.purchaseMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.purchaseMonth) ? r.purchaseMonth : null }
      : {};
  for (const [k, v] of Object.entries({ quantity, manualValue, costBasis, costFx, ...extra, ...home })) {
    if (typeof v === "string") continue;
    if (v !== null && (!Number.isFinite(v) || v < 0)) return `${k} must be a positive number for ${name}`;
  }
  if ((extra.feeDeposit ?? 0) > 10 || (extra.feeBalance ?? 0) > 10 || (extra.interestRate ?? 0) > 100) return `fee or rate out of range for ${name}`;
  if (symbol && quantity === null) return `quantity is required with a symbol for ${name}`;
  if (!symbol && manualValue === null) return `a value or a symbol is required for ${name}`;
  return {
    name,
    type: r.type as AssetInput["type"],
    currency,
    symbol,
    quantity: symbol ? quantity : null,
    manualValue: symbol ? null : manualValue,
    costBasis,
    costFx: costFx && costFx > 0 ? costFx : null,
    liquid: r.liquid !== false,
    note: typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 200) : null,
    ...extra,
    fundId: Number.isInteger(Number(r.fundId)) && Number(r.fundId) > 0 ? Number(r.fundId) : null,
    fundSource: r.fundSource === "gemel" || r.fundSource === "pension" ? r.fundSource : null,
    ...home,
  };
}
