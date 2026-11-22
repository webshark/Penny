import { describe, expect, it } from "vitest";
import { compactShekels } from "@/lib/money";

describe("compactShekels", () => {
  it("puts the sign before the shekel sign, in one LTR run, like shekels", () => {
    expect(compactShekels(-950_500, "he")).toBe("⁦−₪950.5K⁩");
    expect(compactShekels(48_700, "he")).toBe("⁦₪48.7K⁩");
    expect(compactShekels(2_700_000, "en")).toBe("⁦₪2.7M⁩");
    expect(compactShekels(200, "he")).toBe("⁦₪200⁩");
  });
});
