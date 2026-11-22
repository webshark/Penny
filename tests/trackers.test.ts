import { describe, expect, it } from "vitest";
import { parseTrackers, trackerStatus, type Tracker } from "@/lib/trackers";

const t: Tracker = { id: "a", name: "Eating out", categoryIds: [1, 3], from: "2026-11-01", to: "2026-11-30", limit: 1000 };
const rows = [
  { categoryId: 1, parentId: null, spent: 600 }, // parent, already includes child 2
  { categoryId: 2, parentId: 1, spent: 200 },
  { categoryId: 3, parentId: null, spent: 500 },
  { categoryId: 4, parentId: null, spent: 999 },
];

describe("trackers", () => {
  it("sums chosen categories without counting a chosen parent's children twice", () => {
    const s = trackerStatus(t, rows, "2026-11-21");
    expect(s.spent).toBe(1100);
    expect(s.over).toBe(true);
    expect(s.used).toBeCloseTo(1.1);
    expect(s).toMatchObject({ state: "active", daysLeft: 10 });
  });

  it("knows upcoming and ended ranges", () => {
    expect(trackerStatus(t, [], "2026-10-31").state).toBe("upcoming");
    expect(trackerStatus(t, [], "2026-12-01")).toMatchObject({ state: "ended", daysLeft: 0 });
    expect(trackerStatus(t, [], "2026-11-30").daysLeft).toBe(1);
  });

  it("drops malformed stored trackers", () => {
    expect(parseTrackers([t, { ...t, limit: 0 }, { ...t, from: "2026-12-01" }, { ...t, name: " " }, null, "x"])).toEqual([t]);
    expect(parseTrackers("nope")).toEqual([]);
  });
});
