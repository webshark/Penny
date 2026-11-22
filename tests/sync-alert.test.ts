import { describe, expect, it } from "vitest";
import { syncAlert } from "@/lib/sync-alert";

describe("syncAlert", () => {
  it("speaks only when a connection's state changes", () => {
    expect(syncAlert([{ label: "לאומי", ok: true, wasFailing: false }, { label: "מקס", ok: false, wasFailing: true }])).toBeNull();
    const text = syncAlert([{ label: "מקס", ok: false, wasFailing: false, reason: "הסיסמה נדחתה." }, { label: "לאומי", ok: true, wasFailing: true }])!;
    expect(text).toContain("הסנכרון של מקס נכשל.\nהסיסמה נדחתה.");
    expect(text).toContain("לאומי מסתנכרן שוב");
  });
});
