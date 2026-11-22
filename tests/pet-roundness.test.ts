import { it, expect } from "vitest";
import { parsePet } from "@/lib/pet";

it("keeps head roundness within 0 to 100, and null when unset or invalid", () => {
  expect(parsePet({ roundness: 75 }).roundness).toBe(75);
  expect(parsePet({ roundness: 140 }).roundness).toBe(100);
  expect(parsePet({ roundness: -3 }).roundness).toBe(0);
  expect(parsePet({ roundness: "round" }).roundness).toBeNull();
  expect(parsePet({}).roundness).toBeNull();
});
