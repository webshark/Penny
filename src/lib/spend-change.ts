/**
 * Why spending changed between two periods, merchant by merchant, in plain parts:
 *  - "price":  the same merchant charged more (or less) each time;
 *  - "more" / "less": the same merchant, more (or fewer) charges;
 *  - "new": a merchant with nothing in the earlier period;
 *  - "gone": a merchant with nothing in this one;
 *  - "oneOff": a single charge far above that merchant's usual (a repair, a flight).
 * For a merchant in both periods the change splits exactly into volume (count change × old average) and
 * price (average change × new count), so the parts add up to the total. Pure, so it can be tested.
 */
export interface SpendRow { merchant: string; amount: number }
export type DriverKind = "price" | "more" | "less" | "new" | "gone" | "oneOff";
export interface Driver { merchant: string; kind: DriverKind; amount: number }

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const MIN_DRIVER = 50;
const ONE_OFF = 3; // a charge this many times the merchant's earlier average

export function explainChange(before: SpendRow[], now: SpendRow[]): { before: number; now: number; change: number; drivers: Driver[] } {
  const group = (rows: SpendRow[]) => {
    const m = new Map<string, number[]>();
    for (const r of rows) {
      const list = m.get(r.merchant);
      if (list) list.push(r.amount);
      else m.set(r.merchant, [r.amount]);
    }
    return m;
  };
  const b = group(before), n = group(now);
  const drivers: Driver[] = [];
  for (const merchant of new Set([...b.keys(), ...n.keys()])) {
    const pb = b.get(merchant) ?? [], pn = n.get(merchant) ?? [];
    const tb = sum(pb), tn = sum(pn);
    if (pb.length === 0) { drivers.push({ merchant, kind: "new", amount: tn }); continue; }
    if (pn.length === 0) { drivers.push({ merchant, kind: "gone", amount: -tb }); continue; }
    const avgB = tb / pb.length;
    // A single outsized charge explains itself better than "price went up".
    const big = pn.filter((a) => avgB > 0 && a > avgB * ONE_OFF);
    if (big.length === 1 && pn.length > 1 && tn - tb > 0) {
      const rest = pn.filter((a) => a !== big[0]);
      drivers.push({ merchant, kind: "oneOff", amount: big[0] - avgB });
      const restChange = sum(rest) + avgB - tb;
      if (Math.abs(restChange) >= MIN_DRIVER) drivers.push({ merchant, kind: restChange > 0 ? "more" : "less", amount: restChange });
      continue;
    }
    const volume = (pn.length - pb.length) * avgB;
    const price = (tn / pn.length - avgB) * pn.length;
    if (Math.abs(volume) >= MIN_DRIVER) drivers.push({ merchant, kind: volume > 0 ? "more" : "less", amount: volume });
    if (Math.abs(price) >= MIN_DRIVER) drivers.push({ merchant, kind: "price", amount: price });
  }
  const tb = sum(before.map((r) => r.amount)), tn = sum(now.map((r) => r.amount));
  return {
    before: Math.round(tb),
    now: Math.round(tn),
    change: Math.round(tn - tb),
    drivers: drivers
      .filter((d) => Math.abs(d.amount) >= MIN_DRIVER)
      .map((d) => ({ ...d, amount: Math.round(d.amount) }))
      .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))
      .slice(0, 6),
  };
}
