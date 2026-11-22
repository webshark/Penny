/** Portfolio transactions: buys and sells of one holding, in the holding's currency. */
export interface HoldingTrade {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  kind: "buy" | "sell";
  quantity: number;
  /** Per unit. */
  price: number;
  fee: number;
  note: string | null;
}

/**
 * Units held, their cost (average-cost method: a sale removes cost at the average price so far, and buy fees are part of
 * the cost) and the gain already realized by sales, net of their fees. Trades are taken in date order.
 */
export function holdingFromTrades(trades: Pick<HoldingTrade, "id" | "date" | "kind" | "quantity" | "price" | "fee">[]) {
  let quantity = 0, cost = 0, realized = 0;
  for (const t of [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    if (t.kind === "buy") {
      quantity += t.quantity;
      cost += t.quantity * t.price + t.fee;
    } else {
      const sold = Math.min(t.quantity, quantity);
      const avg = quantity > 0 ? cost / quantity : 0;
      realized += sold * t.price - t.fee - sold * avg;
      cost -= sold * avg;
      quantity -= sold;
    }
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { quantity: round(quantity), costBasis: round(cost), realized: round(realized) };
}

/** A trade from a request body, or an error message. */
export function parseTradeInput(raw: unknown): Omit<HoldingTrade, "id"> | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const quantity = num(r.quantity), price = num(r.price), fee = r.fee == null || r.fee === "" ? 0 : num(r.fee);
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) return "date must be YYYY-MM-DD";
  if (r.kind !== "buy" && r.kind !== "sell") return "kind must be buy or sell";
  if (!Number.isFinite(quantity) || quantity <= 0) return "quantity must be positive";
  if (!Number.isFinite(price) || price < 0) return "price must be zero or more";
  if (!Number.isFinite(fee) || fee < 0) return "fee must be zero or more";
  const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 200) : null;
  return { date: r.date, kind: r.kind, quantity, price, fee, note };
}
