import { describe, expect, it } from "vitest";
import { foreignAmount } from "@/lib/foreign-amount";

describe("foreignAmount", () => {
  it("formats a foreign charge in its own currency", () => {
    expect(foreignAmount(-12.5, "USD", "en")).toBe("-$12.50");
    expect(foreignAmount(30, "EUR", "en")).toBe("€30.00");
  });
  it("is null for shekels and bad codes", () => {
    expect(foreignAmount(10, "ILS", "en")).toBeNull();
    expect(foreignAmount(10, "$", "en")).toBeNull();
    expect(foreignAmount(10, null, "en")).toBeNull();
    expect(foreignAmount(NaN, "USD", "en")).toBeNull();
  });
});
