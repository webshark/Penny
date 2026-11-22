import { describe, expect, it } from "vitest";
import { moneyFlow } from "@/lib/money-flow";

const sum = (links: { value: number }[]) => links.reduce((s, l) => s + l.value, 0);

describe("moneyFlow", () => {
  it("splits income into expenses and savings, and expenses into top categories plus other", () => {
    const f = moneyFlow(1000, [{ name: "a", spent: 300, color: "#1" }, { name: "b", spent: 200, color: "#2" }, { name: "c", spent: 100, color: "#3" }], 2)!;
    expect(f.nodes.map((n) => n.name)).toEqual(["income", "expenses", "saved", "a", "b", "other"]);
    const into = (i: number) => sum(f.links.filter((l) => l.target === i));
    const out = (i: number) => sum(f.links.filter((l) => l.source === i));
    expect(out(0)).toBe(1000);
    expect(into(1)).toBe(out(1)); // expenses balance
    expect(into(2)).toBe(400);
  });

  it("feeds a deficit into expenses when spending is above income", () => {
    const f = moneyFlow(100, [{ name: "a", spent: 250, color: "#1" }])!;
    expect(f.nodes.map((n) => n.kind)).toEqual(["income", "expenses", "deficit", "category"]);
    expect(sum(f.links.filter((l) => l.target === 1))).toBe(250);
  });

  it("is null with nothing to show", () => {
    expect(moneyFlow(0, [])).toBeNull();
  });
});
