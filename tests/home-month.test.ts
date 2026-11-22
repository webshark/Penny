import { it, expect } from "vitest";
import { homeMonthDate } from "@/lib/home-month";

it("uses the last day of a past month, and today for this month, a future month or junk", () => {
  const today = new Date(2026, 10, 21, 12);
  expect(homeMonthDate("2026-02", today)).toEqual(new Date(2026, 1, 28, 12));
  expect(homeMonthDate("2026-11", today)).toBe(today);
  expect(homeMonthDate("2027-01", today)).toBe(today);
  expect(homeMonthDate("2026-13", today)).toBe(today);
  expect(homeMonthDate(null, today)).toBe(today);
});
