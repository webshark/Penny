import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let lib: typeof import("@/server/lib/auto-backup");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "penny-autobk-"));
beforeAll(async () => {
  process.env.PENNY_DATA_DIR = path.join(root, "data");
  lib = await import("@/server/lib/auto-backup");
});

describe("automatic backup", () => {
  it("is due when never run or the period passed", () => {
    const now = Date.parse("2026-11-21T10:00:00Z");
    expect(lib.backupDue(null, "daily", now)).toBe(true);
    expect(lib.backupDue("2026-11-20T10:30:00Z", "daily", now)).toBe(true); // an hour early is fine
    expect(lib.backupDue("2026-11-21T05:00:00Z", "daily", now)).toBe(false);
    expect(lib.backupDue("2026-11-18T10:00:00Z", "weekly", now)).toBe(false);
  });

  it("prunes only its own files beyond the newest few", () => {
    const names = ["notes.txt", ...Array.from({ length: 9 }, (_, i) => `penny-backup-2026-11-${String(10 + i).padStart(2, "0")}-08-00.pennybak`)];
    expect(lib.backupsToPrune(names, 7)).toEqual(["penny-backup-2026-11-10-08-00.pennybak", "penny-backup-2026-11-11-08-00.pennybak"]);
  });

  it("needs a passphrase, then writes an encrypted backup that restores", async () => {
    const dir = path.join(root, "drive", "Penny backups");
    expect(() => lib.updateAutoBackupConfig({ enabled: true })).toThrow("noPassphrase");
    expect(() => lib.updateAutoBackupConfig({ passphrase: "short" })).toThrow("weakPassphrase");
    lib.updateAutoBackupConfig({ passphrase: "correct horse battery", dir, enabled: true });
    const c = lib.runAutoBackup();
    expect(c.status).toBe("ok");
    const file = fs.readdirSync(dir).find((f) => f.endsWith(".pennybak"))!;
    const bytes = fs.readFileSync(path.join(dir, file));
    expect(bytes.subarray(0, 8).toString()).toBe("PENNYBK1");
    const { readBackup } = await import("@/server/lib/portable-backup");
    expect(() => readBackup(bytes, "wrong passphrase!!")).toThrow();
    expect(readBackup(bytes, "correct horse battery").format).toBe(1);
    expect(JSON.stringify(lib.getAutoBackupConfig())).not.toContain("correct horse");
  });
});
