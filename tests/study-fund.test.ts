import { describe, expect, it } from "vitest";
import { studyFundIsLiquid, studyFundLiquidFrom } from "@/lib/study-fund";

describe("study fund liquidity", () => {
  it("frees the money six years after the first deposit", () => {
    expect(studyFundLiquidFrom("2020-03")).toBe("2026-03");
    expect(studyFundIsLiquid("2020-03", "2026-02-28")).toBe(false);
    expect(studyFundIsLiquid("2020-03", "2026-03-01")).toBe(true);
    expect(studyFundIsLiquid("2020-03", "2026-11")).toBe(true);
  });
  it("ignores a malformed month", () => {
    expect(studyFundLiquidFrom("2020-13")).toBeNull();
    expect(studyFundIsLiquid("bad", "2030-01-01")).toBe(false);
  });
});
