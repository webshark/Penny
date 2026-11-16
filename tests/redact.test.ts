import { describe, expect, it } from "vitest";
import { redact, redactError, redactScraperError } from "@/server/lib/redact";

describe("redactScraperError", () => {
  // The shape israeli-bank-scrapers gives a failed Isracard/Amex login: the request body is in the message.
  const dump = (body: object) =>
    `fetchPostWithinPage parse error: Unexpected token <, url: https://x.example/?reqName=performLogonI, data: ${JSON.stringify(body)}, extraHeaders: {"authorization":"Bearer tok.en-123"}, result: <html>down</html>, status: 200`;

  it("removes a password sent under a field name the key list does not know", () => {
    const s = redactScraperError(dump({ KodMishtamesh: "bankuser", MisparZihuy: "123456782", Sisma: "Passw0rd!x" }), ["Passw0rd!x"]);
    expect(s).not.toMatch(/Passw0rd|bankuser|123456782|tok\.en/);
    expect(s).toContain("fetchPostWithinPage parse error");
    expect(s).toContain("reqName=performLogonI");
  });

  it("removes the password even when no secrets are passed, and in escaped or URL-encoded form", () => {
    expect(redactScraperError(dump({ Sisma: "Passw0rd!x" }))).not.toContain("Passw0rd");
    const tricky = 'a"b\\c d&e';
    const s = redactScraperError(`${dump({ Sisma: tricky })} then ?p=${encodeURIComponent(tricky)} and raw ${tricky}`, [tricky]);
    expect(s).not.toContain("b\\c d&e");
    expect(s).not.toContain("b%5Cc");
  });

  it("leaves ordinary error text alone and ignores very short values", () => {
    expect(redactScraperError("Navigation timeout of 60000 ms exceeded", ["1"])).toBe("Navigation timeout of [number] ms exceeded");
  });
});

describe("redact", () => {
  it("removes secrets, emails and long numbers", () => {
    const s = redact(
      'fail {"password":"hunter2"} id=123456789 sk-ant-api03-abcdefghijklmnopqrstuv me@x.co 1234-5678-9012-3456 bot 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawq',
    );
    expect(s).not.toMatch(/hunter2|123456789|abcdefghij|me@x\.co|9012|AAHdq/);
  });

  it("keeps amounts and dates", () => {
    expect(redact("שופרסל 120.50 on 2026-11-06")).toBe("שופרסל 120.50 on 2026-11-06");
  });

  it("redacts error messages", () => {
    expect(redactError(new Error("account 9876543 locked"))).toBe("Error: account [number] locked");
  });
});
