import { describe, it, expect } from "vitest";
import { openInstallments, projectInstallments } from "@/server/insights/installments";

const t = (o: Partial<Parameters<typeof projectInstallments>[0][number]> = {}) => ({
  merchant: "ikea",
  account: "1",
  amount: 100,
  number: 3,
  total: 12,
  date: "2026-10-10",
  ...o,
});

describe("projectInstallments", () => {
  it("projects the remaining payments monthly on the same day", () => {
    const out = projectInstallments([t()], "2026-11-04");
    expect(out).toHaveLength(9);
    expect(out[0]).toMatchObject({ date: "2026-11-10", month: "2026-11", amount: 100, merchant: "ikea", account: "1" });
    expect(out[8].date).toBe("2027-07-10");
  });
  it("uses only the latest payment of a plan", () => {
    const out = projectInstallments([t({ number: 2, date: "2026-09-10" }), t({ number: 3 })], "2026-11-04");
    expect(out).toHaveLength(9);
  });
  it("returns nothing for total of 1 or a finished plan", () => {
    expect(projectInstallments([t({ number: 1, total: 1 })], "2026-11-04")).toEqual([]);
    expect(projectInstallments([t({ number: 12, total: 12 })], "2026-11-04")).toEqual([]);
  });
  it("ignores number above total and non-positive values without throwing", () => {
    expect(projectInstallments([t({ number: 13, total: 12 })], "2026-11-04")).toEqual([]);
    expect(projectInstallments([t({ number: 0, total: 12 })], "2026-11-04")).toEqual([]);
    expect(projectInstallments([t({ amount: 0 })], "2026-11-04")).toEqual([]);
  });
  it("reports amounts as positive commitments even if charges are negative", () => {
    expect(projectInstallments([t({ amount: -100 })], "2026-11-04")[0].amount).toBe(100);
  });
  it("clamps the day to the month length and rolls the year", () => {
    const out = projectInstallments([t({ number: 10, total: 12, date: "2026-12-31" })], "2026-12-31");
    expect(out.map((p) => p.date)).toEqual(["2027-01-31", "2027-02-28"]);
  });
  it("drops projected payments already in the past", () => {
    const out = projectInstallments([t({ number: 3, date: "2026-05-10" })], "2026-11-04");
    expect(out.every((p) => p.date >= "2026-11-04")).toBe(true);
  });
  it("keeps different plans from the same merchant apart", () => {
    const out = projectInstallments([t(), t({ amount: 50, total: 4, number: 1 })], "2026-11-04");
    expect(out).toHaveLength(9 + 3);
  });
});

describe("openInstallments", () => {
  it("sums what is still owed per plan and per month", () => {
    const projected = projectInstallments([t(), t({ merchant: "ace", amount: 50, number: 1, total: 3 })], "2026-11-04");
    const out = openInstallments(projected, "2026-11-04");
    expect(out.total).toBe(9 * 100 + 2 * 50);
    expect(out.plans[0]).toMatchObject({ merchant: "ikea", paid: 3, total: 12, remaining: 900 });
    expect(out.plans[1]).toMatchObject({ merchant: "ace", paid: 1, total: 3, remaining: 100 });
    expect(out.months[0]).toEqual({ month: "2026-11", total: 150 });
    expect(out.months.at(-1)).toEqual({ month: "2027-07", total: 100 });
  });
  it("keeps only the next 12 months in the runoff", () => {
    const out = openInstallments(projectInstallments([t({ number: 1, total: 36 })], "2026-11-04"), "2026-11-04");
    expect(out.months).toHaveLength(12);
    expect(out.total).toBe(35 * 100);
  });

  it("treats a first payment an agora apart as the same plan", () => {
    const base = { merchant: "KSP", account: "4580", total: 3 };
    const out = projectInstallments([{ ...base, amount: -333.34, number: 1, date: "2026-11-10" }, { ...base, amount: -333.33, number: 2, date: "2026-12-10" }], "2026-12-11");
    expect(out.map((p) => [p.number, p.amount])).toEqual([[3, 333.33]]);
  });
});
