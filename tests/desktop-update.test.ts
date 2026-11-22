import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { isNewer, checksumFor } = createRequire(import.meta.url)("../desktop/update.cjs") as {
  isNewer: (a: string, b: string) => boolean;
  checksumFor: (listing: string, file: string) => string | null;
};

describe("desktop self-update", () => {
  it("offers only a newer, final release", () => {
    expect(isNewer("1.10.0", "1.9.3")).toBe(true);
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
    expect(isNewer("1.2.2", "1.2.3")).toBe(false);
    expect(isNewer("2.0.0-beta.1", "1.0.0")).toBe(false);
    expect(isNewer("1.2.4", "1.2.3-dev")).toBe(true);
  });
  it("reads the installer's hash from a sha256sum listing", () => {
    const h = "a".repeat(64);
    const listing = `${"b".repeat(64)}  Penny-1.0.0-arm64.dmg\r\n${h} *Penny-Setup-1.0.0.exe\n`;
    expect(checksumFor(listing, "Penny-Setup-1.0.0.exe")).toBe(h);
    expect(checksumFor(listing, "Penny-Setup-9.9.9.exe")).toBeNull();
  });
});
