import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "@/lib/markets";

describe("normalizeSymbol", () => {
  it("uppercases and trims what the user typed", () => {
    expect(normalizeSymbol(" aapl ")).toBe("AAPL");
    expect(normalizeSymbol("teva.ta")).toBe("TEVA.TA");
  });

  it("keeps the separators Yahoo uses", () => {
    expect(normalizeSymbol("btc-usd")).toBe("BTC-USD");
    expect(normalizeSymbol("gc=f")).toBe("GC=F");
    expect(normalizeSymbol("^gspc")).toBe("^GSPC");
  });

  it("drops inner spaces and refuses anything that cannot be a ticker", () => {
    expect(normalizeSymbol("brk b")).toBe("BRKB");
    expect(normalizeSymbol("")).toBeNull();
    expect(normalizeSymbol("   ")).toBeNull();
    expect(normalizeSymbol("AAPL; DROP TABLE")).toBeNull();
    expect(normalizeSymbol("<script>")).toBeNull();
    expect(normalizeSymbol(null)).toBeNull();
    expect(normalizeSymbol(42)).toBeNull();
  });
});