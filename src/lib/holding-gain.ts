/**
 * A holding's gain in ILS, split into what the price did and what the exchange rate did.
 * `costBasis` is in the holding's own currency; `costFx` is the ILS rate when it was bought (null: unknown, so no split).
 */
export function splitGain(valueIls: number, costBasis: number, rateNow: number, costFx: number | null) {
  const price = valueIls - costBasis * rateNow;
  const fx = costFx == null ? null : costBasis * (rateNow - costFx);
  return { total: price + (fx ?? 0), price, fx };
}
