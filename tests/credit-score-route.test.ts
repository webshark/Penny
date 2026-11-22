import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-credit-"));
});

const req = (method: string, body?: unknown) => new Request("http://127.0.0.1/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("credit scores API", () => {
  it("stores valid scores, refuses bad ones, and deletes", async () => {
    const all = await import("@/app/api/credit-scores/route");
    const one = await import("@/app/api/credit-scores/[id]/route");
    expect((await all.POST(req("POST", { date: "2026-11-01", score: 1001 }))).status).toBe(400);
    expect((await all.POST(req("POST", { date: "nope", score: 700 }))).status).toBe(400);
    const saved = await (await all.POST(req("POST", { date: "2026-11-01", score: 742, bureau: "BDI" }))).json();
    expect((await (await all.GET(req("GET"))).json()).scores).toEqual([{ id: saved.id, date: "2026-11-01", bureau: "BDI", score: 742, note: "" }]);
    const ctx = { params: Promise.resolve({ id: String(saved.id) }) };
    expect((await one.DELETE(req("DELETE"), ctx)).status).toBe(200);
    expect((await one.DELETE(req("DELETE"), { params: Promise.resolve({ id: String(saved.id) }) })).status).toBe(404);
  });
});
