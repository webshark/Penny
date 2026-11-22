import { describe, expect, it } from "vitest";
import { quickStart, type QuickStartState } from "@/lib/quick-start";

const empty: QuickStartState = { bankConnected: false, budgetSet: false, uncategorized: null, goals: 0, trackers: 0, tags: 0, views: 0, assets: 0, marked: [] };

describe("quick start", () => {
  it("starts with nothing done", () => {
    const q = quickStart(empty);
    expect(q).toMatchObject({ done: 0, total: 10, remaining: 10 });
  });

  it("marks tasks done from data, and unknown categorization is not done", () => {
    const q = quickStart({ ...empty, bankConnected: true, uncategorized: 0, goals: 2 });
    const done = q.groups.flatMap((g) => g.tasks).filter((t) => t.done).map((t) => t.id);
    expect(done).toEqual(["connect", "categorize", "goal"]);
    expect(q.groups[0]).toMatchObject({ group: "start", done: 1 });
    expect(quickStart({ ...empty, uncategorized: 3 }).done).toBe(0);
  });

  it("counts hand-marked tasks, without auto flag", () => {
    const q = quickStart({ ...empty, marked: ["analytics", "focus"] });
    expect(q.done).toBe(2);
    expect(q.groups[3].tasks.every((t) => t.done && !t.auto)).toBe(true);
  });
});
