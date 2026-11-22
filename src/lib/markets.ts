/** Market tiles on the Markets page; `key` is the i18n label under markets.symbols. */
export const MARKETS = [
  { symbol: "TA35.TA", key: "ta35", group: "israel" },
  { symbol: "^TA125.TA", key: "ta125", group: "israel" },
  { symbol: "^GSPC", key: "sp500", group: "world" },
  { symbol: "^IXIC", key: "nasdaq", group: "world" },
  { symbol: "URTH", key: "msciWorld", group: "world" },
  { symbol: "USDILS=X", key: "usdils", group: "fx" },
  { symbol: "EURILS=X", key: "eurils", group: "fx" },
  { symbol: "GC=F", key: "gold", group: "commodities" },
  { symbol: "CL=F", key: "oil", group: "commodities" },
  { symbol: "BTC-USD", key: "bitcoin", group: "commodities" },
] as const;

/** Yahoo Finance symbol: letters, digits and the few separators its tickers use (AAPL, TEVA.TA, BTC-USD, GC=F). */
const SYMBOL = /^[A-Z0-9.^=-]{1,20}$/;

/** A typed symbol as Yahoo spells it, or null when it cannot be one. */
export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\s+/g, "").toUpperCase();
  return SYMBOL.test(s) ? s : null;
}

/** Benchmarks shown against the portfolio on the Investments page. */
export const BENCHMARKS = ["^GSPC", "^TA125.TA"] as const;
