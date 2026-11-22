import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuotes } from "@/server/markets/quotes";
import { dailyRates } from "@/server/insights/fx-rates";
import { loadDwellingIndex } from "@/server/markets/property";

/**
 * The demo promises that nothing leaves the machine. These are the passive
 * readers (market quotes, FX rates, the CBS housing index); each one must
 * answer empty in demo mode without touching the network.
 */
describe("demo mode keeps the passive data readers offline", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns no quotes, rates or index and never calls fetch", async () => {
    vi.stubEnv("PENNY_DEMO", "1");
    const fetchSpy = vi.fn(() => Promise.reject(new Error("the demo must not use the network")));
    vi.stubGlobal("fetch", fetchSpy);

    expect(await getQuotes(["TA125.TA", "USDILS=X"])).toEqual(new Map());
    expect(await dailyRates(["USD", "EUR"], "2026-11-20")).toEqual({});
    expect(await loadDwellingIndex()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
