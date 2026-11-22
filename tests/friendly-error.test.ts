import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/api";

describe("friendlyError", () => {
  it("keeps the server's text when it is already in the UI language", () => {
    expect(friendlyError(400, JSON.stringify({ error: "phone must be an Israeli number" }), "en")).toBe("phone must be an Israeli number");
    expect(friendlyError(400, JSON.stringify({ error: "הסכום לא תקין" }), "he")).toBe("הסכום לא תקין");
  });
  it("explains by status when the server spoke the other language", () => {
    expect(friendlyError(400, JSON.stringify({ error: "invalid amount" }), "he")).toContain("לא תקינים");
    expect(friendlyError(500, "Internal Server Error", "he")).toContain("השתבש");
  });
  it("never shows an HTML error page", () => {
    expect(friendlyError(502, "<html>Bad gateway</html>", "en")).toContain("Something went wrong");
  });
  it("does not call every 409 a busy sync", () => {
    const duplicate = JSON.stringify({ error: "a category with this name already exists" });
    expect(friendlyError(409, duplicate, "he")).toContain("הנתונים השתנו");
    expect(friendlyError(409, duplicate, "en")).toContain("already exists");
    const busy = JSON.stringify({ error: "sync-running", message: "A sync is already running. Wait for it to finish." });
    expect(friendlyError(409, busy, "he")).toContain("סנכרון כבר רץ");
    expect(friendlyError(409, busy, "en")).toContain("already running");
  });
  it("translates machine codes instead of showing them", () => {
    expect(friendlyError(401, JSON.stringify({ error: "locked" }), "en")).toContain("locked. Enter your code");
    expect(friendlyError(401, JSON.stringify({ error: "locked" }), "he")).toContain("נעולה");
    expect(friendlyError(401, JSON.stringify({ error: "sign-in-required" }), "en")).not.toContain("sign-in-required");
    expect(friendlyError(400, JSON.stringify({ error: "kind-mismatch" }), "en")).not.toContain("kind-mismatch");
    expect(friendlyError(400, JSON.stringify({ error: "bad_request" }), "en")).toContain("aren't valid");
  });
  it("has a message for a dropped connection", () => {
    expect(friendlyError("network", "", "he")).toContain("אין חיבור");
  });
});
