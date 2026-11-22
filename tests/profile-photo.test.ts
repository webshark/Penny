import { it, expect } from "vitest";
import { parseAvatar } from "@/lib/profile-avatar";

it("accepts a small image data URL, clears on null, and refuses anything else", () => {
  expect(parseAvatar({ avatarPhoto: "data:image/jpeg;base64,/9j/AAA=" })).toEqual({ avatarPhoto: "data:image/jpeg;base64,/9j/AAA=" });
  expect(parseAvatar({ avatarPhoto: null })).toEqual({ avatarPhoto: null });
  expect(parseAvatar({ avatarPhoto: "https://example.com/a.jpg" })).toHaveProperty("error");
  expect(parseAvatar({ avatarPhoto: "data:image/svg+xml;base64,PHN2Zz4=" })).toHaveProperty("error");
  expect(parseAvatar({ avatarPhoto: "data:image/png;base64," + "A".repeat(300_001) })).toHaveProperty("error");
  expect(parseAvatar({})).toEqual({});
});
