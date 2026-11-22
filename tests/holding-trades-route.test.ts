import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-trades-"));
});

const req = (method: string, body?: unknown) => new Request("http://127.0.0.1/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("holding trades API", () => {
  it("records buys and sells, keeps the holding's quantity and cost in step, and undoes on delete", async () => {
    const { getDb } = await import("@/server/db");
    const { getWorkspaceIdFromRequest } = await import("@/server/lib/workspace-context");
    const ws = getWorkspaceIdFromRequest(new Request("http://127.0.0.1/"));
    const assetId = Number(getDb().prepare("INSERT INTO assets (workspace_id, name, type, currency, symbol, quantity, cost_basis) VALUES (?, 'S&P 500', 'fund', 'USD', 'VOO', 1, 1)").run(ws).lastInsertRowid);
    const trades = await import("@/app/api/assets/[id]/trades/route");
    const one = await import("@/app/api/assets/trades/[tradeId]/route");

    expect((await trades.POST(req("POST", { date: "bad", kind: "buy", quantity: 1, price: 1 }), ctx(assetId))).status).toBe(400);
    expect((await trades.POST(req("POST", { date: "2026-01-01", kind: "buy", quantity: 1, price: 1 }), ctx(999999))).status).toBe(404);

    await trades.POST(req("POST", { date: "2026-01-10", kind: "buy", quantity: 10, price: 100 }), ctx(assetId));
    const sell = await (await trades.POST(req("POST", { date: "2026-06-01", kind: "sell", quantity: 4, price: 150 }), ctx(assetId))).json();
    const asset = () => getDb().prepare("SELECT quantity, cost_basis AS cost FROM assets WHERE id = ?").get(assetId) as { quantity: number; cost: number };
    expect(asset()).toEqual({ quantity: 6, cost: 600 });
    const listed = await (await trades.GET(req("GET"), ctx(assetId))).json();
    expect(listed.trades).toHaveLength(2);
    expect(listed.summary.realized).toBe(200);

    expect((await one.DELETE(req("DELETE"), { params: Promise.resolve({ tradeId: String(sell.id) }) })).status).toBe(200);
    expect(asset()).toEqual({ quantity: 10, cost: 1000 });
  });
});
