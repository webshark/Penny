import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "penny-bkfiles-"));
  process.env.PENNY_DATA_DIR = root;
});

describe("backups carry documents and receipts", () => {
  it("restores receipt and policy files with the database", async () => {
    const { getDb } = await import("@/server/db");
    getDb();
    const receipt = path.join(root, "receipts", "1", "7", "3-קבלה.pdf");
    const policy = path.join(root, "policies", "1", "2", "1-policy.pdf");
    for (const [f, body] of [[receipt, "receipt"], [policy, "policy"]]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); }

    const { applyBackup, createBackup } = await import("@/server/lib/portable-backup");
    const { bytes } = createBackup("long enough pass");
    fs.rmSync(path.join(root, "receipts"), { recursive: true });
    fs.rmSync(path.join(root, "policies"), { recursive: true });
    applyBackup(bytes, "long enough pass");
    expect(fs.readFileSync(receipt, "utf8")).toBe("receipt");
    expect(fs.readFileSync(policy, "utf8")).toBe("policy");
  });

  it("never writes outside the document folders", async () => {
    const { restorePathFor } = await import("@/server/lib/portable-backup");
    expect(restorePathFor(root, "receipts/1/2/a.pdf")).toBe(path.join(root, "receipts", "1", "2", "a.pdf"));
    for (const bad of ["penny.db", "receipts/../penny.db", "receipts/1/../../key", "../x", "policies//a", "receipts"]) expect(restorePathFor(root, bad), bad).toBeNull();
  });
});
