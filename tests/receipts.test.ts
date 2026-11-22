import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-receipts-"));
});

const ctx = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
const upload = (type: string, body = "%PDF-1.4 test") => {
  const form = new FormData();
  form.append("file", new File([body], "חשבונית מרץ.pdf", { type }));
  return new Request("http://127.0.0.1/api/x", { method: "POST", body: form });
};

describe("transaction receipts", () => {
  it("stores, lists, streams and deletes a receipt, and refuses bad input", async () => {
    const { getDb } = await import("@/server/db");
    const { getWorkspaceIdFromRequest } = await import("@/server/lib/workspace-context");
    const db = getDb();
    const ws = getWorkspaceIdFromRequest(new Request("http://127.0.0.1/"));
    const sync = Number(db.prepare("INSERT INTO sync_runs (workspace_id,provider,status,scrape_from_date,started_at) VALUES (?,'hapoalim','completed','2026-01-01','2026-11-01')").run(ws).lastInsertRowid);
    const txn = Number(db.prepare("INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind) VALUES (?,'123','2026-11-01','2026-11-01',-100,'ILS',-100,'Shop','normal','completed','hapoalim',?,'r1','expense')").run(ws, sync).lastInsertRowid);

    const list = await import("@/app/api/transactions/[id]/receipts/route");
    const one = await import("@/app/api/receipts/[id]/route");
    expect((await list.POST(upload("text/html"), ctx(txn))).status).toBe(415);
    expect((await list.POST(upload("application/pdf"), ctx(999999))).status).toBe(404);
    expect((await list.POST(upload("application/pdf"), ctx("abc"))).status).toBe(400);

    const created = await (await list.POST(upload("application/pdf"), ctx(txn))).json();
    expect(created.originalName).toBe("חשבונית מרץ.pdf");
    const { receipts } = await (await list.GET(new Request("http://127.0.0.1/"), ctx(txn))).json();
    expect(receipts).toHaveLength(1);

    const file = await one.GET(new Request("http://127.0.0.1/"), ctx(created.id));
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.4 test");

    expect((await one.DELETE(new Request("http://127.0.0.1/", { method: "DELETE" }), ctx(created.id))).status).toBe(200);
    expect((await one.GET(new Request("http://127.0.0.1/"), ctx(created.id))).status).toBe(404);
  });
});
