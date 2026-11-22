import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-shares-"));
});

const req = (method: string, body?: unknown) => new Request("http://127.0.0.1/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("expense shares API", () => {
  it("adds who owes part of an expense, lists it, and settles per person", async () => {
    const { getDb } = await import("@/server/db");
    const { getWorkspaceIdFromRequest } = await import("@/server/lib/workspace-context");
    const ws = getWorkspaceIdFromRequest(new Request("http://127.0.0.1/"));
    const sync = Number(getDb().prepare("INSERT INTO sync_runs (workspace_id,provider,status,scrape_from_date,started_at) VALUES (?,'manual','completed','2026-01-01','2026-11-01')").run(ws).lastInsertRowid);
    const txId = Number(getDb().prepare("INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind) VALUES (?,'1','2026-11-01','2026-11-01',-300,'ILS',-300,'Dinner','normal','completed','manual',?,'s1','expense')").run(ws, sync).lastInsertRowid);
    const perTx = await import("@/app/api/transactions/[id]/shares/route");
    const all = await import("@/app/api/shares/route");
    const one = await import("@/app/api/shares/[id]/route");

    expect((await perTx.POST(req("POST", { person: "", amount: 10 }), ctx(txId))).status).toBe(400);
    expect((await perTx.POST(req("POST", { person: "Dana", amount: -1 }), ctx(txId))).status).toBe(400);
    expect((await perTx.POST(req("POST", { person: "Dana", amount: 10 }), ctx(999999))).status).toBe(404);

    const a = await (await perTx.POST(req("POST", { person: "Dana", amount: 100 }), ctx(txId))).json();
    await perTx.POST(req("POST", { person: "Avi", amount: 100 }), ctx(txId));
    // 200 of the 300 is already split: 101 more would be more than the expense.
    expect((await perTx.POST(req("POST", { person: "Noa", amount: 101 }), ctx(txId))).status).toBe(400);
    expect((await (await perTx.GET(req("GET"), ctx(txId))).json()).shares).toHaveLength(2);

    expect((await one.PATCH(req("PATCH", { settled: true }), ctx(a.id))).status).toBe(200);
    expect((await one.PATCH(req("PATCH", { settled: "yes" }), ctx(a.id))).status).toBe(400);
    expect((await (await all.POST(req("POST", { settlePerson: "avi" }))).json()).settled).toBe(1);
    const listed = (await (await all.GET(req("GET"))).json()).shares as { settledAt: string | null; description: string }[];
    expect(listed.every((s) => s.settledAt)).toBe(true);
    expect(listed[0].description).toBe("Dinner");

    expect((await one.DELETE(req("DELETE"), ctx(a.id))).status).toBe(200);
    expect((await one.DELETE(req("DELETE"), ctx(a.id))).status).toBe(404);

    // The expense row goes away (a pending charge replaced on sync): what Avi owes stays, with its description.
    getDb().prepare("DELETE FROM transactions WHERE id = ?").run(txId);
    const kept = (await (await all.GET(req("GET"))).json()).shares as { person: string; description: string }[];
    expect(kept).toEqual([expect.objectContaining({ person: "Avi", description: "Dinner" })]);
  });
});
