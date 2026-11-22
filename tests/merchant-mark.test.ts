import { describe, expect, it } from "vitest";
import { merchantMark } from "@/lib/merchant-mark";

describe("merchantMark", () => {
  it("gives known brands their colour and initial", () => {
    expect(merchantMark("שופרסל דיל")).toEqual({ letter: "ש", color: "#e2001a" });
    expect(merchantMark("NETFLIX.COM")).toEqual({ letter: "N", color: "#e50914" });
    // Hebrew words have no \b edges: "פז דלק" is Paz, not Delek, and "גטו" is not Gett.
    expect(merchantMark("פז דלק").letter).toBe("פ");
    expect(merchantMark("גטו פיצה").color).not.toBe("#ffd700");
  });
  it("gives any other merchant a steady colour and its first letter", () => {
    const a = merchantMark("מאפיית הכיכר");
    expect(a.letter).toBe("מ");
    expect(merchantMark("מאפיית הכיכר")).toEqual(a);
    expect(merchantMark("  !! 9to5 ").letter).toBe("9");
  });
});
