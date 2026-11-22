import { describe, expect, it } from "vitest";
import { localizeBankLabel } from "@/lib/i18n-data";
import he from "@/i18n/messages/he.json";

const tBanks = ((key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], he.banks) as string ?? key) as never;

describe("localizeBankLabel", () => {
  it("puts a server label's bank name in Hebrew and keeps the last four digits", () => {
    expect(localizeBankLabel("Bank Hapoalim · 0001", tBanks)).toBe("הפועלים · 0001");
  });
  it("leaves a label it does not recognise as it is", () => {
    expect(localizeBankLabel("Cash", tBanks)).toBe("Cash");
  });
});
