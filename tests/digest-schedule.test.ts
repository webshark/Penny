import { describe, expect, it } from "vitest";
import { digestDue, israelClock } from "@/lib/digest-schedule";

describe("digestDue", () => {
  // 2026-11-22 is a Sunday; Israel is UTC+2 in November.
  const sunday9 = new Date("2026-11-22T07:30:00Z");
  it("is due on a summary day from 09:00 Israel time, once", () => {
    expect(israelClock(sunday9)).toEqual({ date: "2026-11-22", weekday: 0, hour: 9 });
    expect(digestDue(sunday9, null)).toBe(true);
    expect(digestDue(sunday9, "2026-11-22")).toBe(false);
    expect(digestDue(sunday9, "2026-11-19")).toBe(true);
  });
  it("waits for the hour and skips other days", () => {
    expect(digestDue(new Date("2026-11-22T05:30:00Z"), null)).toBe(false);
    expect(digestDue(new Date("2026-11-23T10:00:00Z"), null)).toBe(false); // Monday
    expect(digestDue(new Date("2026-11-26T10:00:00Z"), null)).toBe(true); // Thursday
  });
});
