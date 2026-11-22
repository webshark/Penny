import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

let backup: typeof import("@/server/lib/portable-backup");
let getGlobalSetting: typeof import("@/server/db/queries/settings").getGlobalSetting;
let setGlobalSetting: typeof import("@/server/db/queries/settings").setGlobalSetting;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-portable-"));
  const settings = await import("@/server/db/queries/settings");
  getGlobalSetting = settings.getGlobalSetting;
  setGlobalSetting = settings.setGlobalSetting;
  backup = await import("@/server/lib/portable-backup");
});

const PASSPHRASE = "correct horse battery";

describe("portable backup", () => {
  it("round-trips through encrypt and decrypt", () => {
    const plain = Buffer.from("hello penny", "utf8");
    const file = backup.encryptBackup(plain, PASSPHRASE);
    expect(backup.decryptBackup(file, PASSPHRASE).toString("utf8")).toBe("hello penny");
  });

  it("refuses a wrong passphrase and a foreign file", () => {
    const file = backup.encryptBackup(Buffer.from("x"), PASSPHRASE);
    expect(() => backup.decryptBackup(file, "wrong passphrase")).toThrow("badPassphrase");
    expect(() => backup.decryptBackup(Buffer.from("not a backup at all"), PASSPHRASE)).toThrow("badFile");
  });

  it("requires a real passphrase", () => {
    expect(() => backup.createBackup("short")).toThrow("weakPassphrase");
  });

  it("restores the database it was taken from, keeping a copy of the replaced one", () => {
    setGlobalSetting("portable-test", "before");
    const { bytes, fileName } = backup.createBackup(PASSPHRASE);
    expect(fileName.endsWith(".pennybak")).toBe(true);
    expect(bytes.subarray(0, 8).toString()).toBe("PENNYBK1");

    setGlobalSetting("portable-test", "after");
    const result = backup.applyBackup(bytes, PASSPHRASE);

    expect(getGlobalSetting("portable-test")).toBe("before");
    expect(result.counts.transactions).toBeGreaterThanOrEqual(0);
    expect(result.preRestoreBackup).toBeTruthy();
    expect(fs.existsSync(result.preRestoreBackup!)).toBe(true);
  });

  it("brings back the encryption key, so logins saved before the backup can be read after a restore", async () => {
    const enc = await import("@/server/lib/encryption");
    const secret = enc.encrypt("bank password");
    const { bytes } = backup.createBackup(PASSPHRASE);
    // A new machine: a different key on disk and in memory.
    fs.writeFileSync(enc.keyPath(), "ab".repeat(32), { mode: 0o600 });
    enc.setKeyInMemory(undefined);
    expect(() => enc.decrypt(secret)).toThrow();
    backup.applyBackup(bytes, PASSPHRASE);
    expect(enc.decrypt(secret)).toBe("bank password");
    expect(fs.readFileSync(enc.keyPath(), "utf8")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads keys from older backups, which stored the key file's hex text", () => {
    const key = Buffer.alloc(32, 7);
    expect(backup.backupKey(Buffer.from(key.toString("hex")).toString("base64"))).toEqual(key);
    expect(backup.backupKey(key.toString("base64"))).toEqual(key);
    expect(backup.backupKey("bm9wZQ==")).toBeNull();
  });

  it("refuses to overwrite the database with a wrong passphrase", () => {
    const { bytes } = backup.createBackup(PASSPHRASE);
    setGlobalSetting("portable-test", "still here");
    expect(() => backup.applyBackup(bytes, "the wrong passphrase")).toThrow("badPassphrase");
    expect(getGlobalSetting("portable-test")).toBe("still here");
  });

  it("refuses a file that decrypts but is not a database", () => {
    const fake = backup.encryptBackup(
      Buffer.from(JSON.stringify({ format: 1, createdAt: new Date().toISOString(), appVersion: "x", database: Buffer.from("nope").toString("base64"), encryptionKey: null })),
      PASSPHRASE,
    );
    expect(() => backup.readBackup(fake, PASSPHRASE)).toThrow("badFile");
  });
});
