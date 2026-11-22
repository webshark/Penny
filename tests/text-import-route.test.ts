import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-textimport-"));
});

const post = (body: unknown) => new Request("http://127.0.0.1/api/import/text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/import/text", () => {
  it("refuses empty and oversized text, and says when no AI provider is set up", async () => {
    const { POST } = await import("@/app/api/import/text/route");
    expect((await POST(post({ text: "  " }))).status).toBe(400);
    expect((await POST(post({ text: "x".repeat(20_001) }))).status).toBe(413);
    expect((await POST(post({ text: "03/11 שופרסל 214.50" }))).status).toBe(503);
  });
});
