import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-diag-"));
});

describe("support file", () => {
  it("describes the setup without any money data or secrets", async () => {
    const db = (await import("@/server/db")).getDb();
    const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
    const run = Number(db.prepare("INSERT INTO sync_runs (workspace_id,provider,status,scrape_from_date,started_at,error_message) VALUES (?,'leumi','failed','2026-01-01','2026-11-01','login failed {\"password\":\"hunter2\"} id=123456789')").run(ws).lastInsertRowid);
    db.prepare("INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind) VALUES (?,'12-345-678901','2026-11-01','2026-11-01',-12345.67,'ILS',-12345.67,'SECRET MERCHANT','normal','completed','leumi',?,'d1','expense')").run(ws, run);
    const { GET } = await import("@/app/api/diagnostics/route");
    const text = await (await GET()).text();
    const report = JSON.parse(text);
    expect(report.data.transactions).toBe(1);
    expect(report.recentSyncs[0].status).toBe("failed");
    for (const leak of ["SECRET MERCHANT", "12345.67", "hunter2", "123456789", "12-345-678901"]) expect(text).not.toContain(leak);
  });
});
