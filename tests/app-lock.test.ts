import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import { NextRequest } from "next/server";

let dataDir: string;
const keyFile = () => path.join(dataDir, ".encryption-key");
const lockFile = () => path.join(dataDir, ".app-lock.json");

async function fresh() {
  vi.resetModules();
  globalThis.__pennyDataKey = undefined;
  globalThis.__pennySessions = undefined;
  globalThis.__pennyUnlockFails = undefined;
  return { enc: await import("@/server/lib/encryption"), lock: await import("@/server/lib/app-lock") };
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-lock-"));
  process.env.PENNY_DATA_DIR = dataDir;
  // ./data of the working directory is the "legacy" key location. In a checkout that is also a real install
  // that is the real key, and this suite would copy or shred it. Keep it inside the temp folder.
  vi.spyOn(process, "cwd").mockReturnValue(dataDir);
});

describe("app lock and key wrapping", () => {
  it("without a lock, behaves as before: plaintext key file, never locked", async () => {
    const { enc, lock } = await fresh();
    expect(enc.decrypt(enc.encrypt("x"))).toBe("x");
    expect(fs.existsSync(keyFile())).toBe(true);
    expect(lock.isLockEnabled()).toBe(false);
    expect(enc.isKeyLocked()).toBe(false);
  });

  it("enable wraps the key and removes the plaintext file; after restart decrypt fails until unlock", async () => {
    let { enc, lock } = await fresh();
    const sealed = enc.encrypt("bank-password");
    await lock.enableLock("correct horse", 15);
    expect(fs.existsSync(keyFile())).toBe(false);
    expect(fs.readFileSync(lockFile(), "utf8")).not.toContain(enc.getKey().toString("hex"));

    ({ enc, lock } = await fresh()); // restart: key no longer in memory
    expect(enc.isKeyLocked()).toBe(true);
    expect(() => enc.decrypt(sealed)).toThrow(enc.APP_LOCKED_MESSAGE);

    expect((await lock.checkSecret("wrong pass")).ok).toBe(false);
    expect(await lock.checkSecret("correct horse", Date.now() + 5_000)).toEqual({ ok: true });
    const token = await lock.unlock("correct horse");
    expect(enc.decrypt(sealed)).toBe("bank-password");
    expect(lock.touchSession(token)).toBe(true);
  });

  it("backs off exponentially after wrong attempts", async () => {
    const { lock } = await fresh();
    await lock.enableLock("12345678", 15);
    const t0 = 1_000_000;
    expect(await lock.checkSecret("nope", t0)).toMatchObject({ reason: "wrong", retryAfter: 1 });
    expect(await lock.checkSecret("12345678", t0 + 500)).toMatchObject({ reason: "wait" });
    expect(await lock.checkSecret("nope", t0 + 1_000)).toMatchObject({ reason: "wrong", retryAfter: 2 });
    expect(await lock.checkSecret("nope", t0 + 3_000)).toMatchObject({ reason: "wrong", retryAfter: 4 });
  });

  it("change re-wraps; disable restores the plaintext key file", async () => {
    let { enc, lock } = await fresh();
    const sealed = enc.encrypt("s");
    await lock.enableLock("first-pass", 15);
    await lock.changeLock("first-pass", "second-pass", 5);
    expect(lock.idleMinutes()).toBe(5);
    ({ enc, lock } = await fresh());
    await expect(lock.unlock("first-pass")).rejects.toThrow();
    await lock.unlock("second-pass");
    await lock.disableLock("second-pass");
    expect(fs.existsSync(lockFile())).toBe(false);
    ({ enc, lock } = await fresh());
    expect(enc.decrypt(sealed)).toBe("s");
  });

  it("sessions expire after idle and are refreshed by activity", async () => {
    const { lock } = await fresh();
    await lock.enableLock("12345678", 5);
    const t0 = Date.now();
    const token = lock.createSession(t0);
    expect(lock.touchSession(token, t0 + 4 * 60_000)).toBe(true);
    expect(lock.touchSession(token, t0 + 8 * 60_000)).toBe(true);
    expect(lock.touchSession(token, t0 + 14 * 60_000)).toBe(false);
    expect(lock.touchSession("made-up")).toBe(false);
  });

  it("accepts 8+ characters or a 6+ digit PIN", async () => {
    const { lock } = await fresh();
    expect(lock.isValidSecret("1234567")).toBe(true);
    expect(lock.isValidSecret("abcdefg")).toBe(false);
    expect(lock.isValidSecret("12345")).toBe(false);
    expect(lock.isValidSecret("abcdefgh")).toBe(true);
  });
});

describe("proxy with the lock on", () => {
  const req = (p: string, cookie?: string) =>
    new NextRequest(`http://127.0.0.1:3000${p}`, { headers: { host: "127.0.0.1:3000", ...(cookie ? { cookie } : {}) } });

  it("redirects pages to /lock, answers APIs with 401, lets the lock screen and assets through", async () => {
    const { lock } = await fresh();
    const { proxy } = await import("@/proxy");
    expect(proxy(req("/transactions")).status).toBe(200);
    await lock.enableLock("12345678", 15);
    const page = proxy(req("/transactions"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/lock?next=%2Ftransactions");
    expect(proxy(req("/api/summary")).status).toBe(401);
    expect(proxy(req("/lock")).status).toBe(200);
    expect(proxy(req("/_next/static/x.js")).status).toBe(200);
    expect(proxy(req("/api/x.json")).status).toBe(401);
    const token = lock.createSession();
    expect(proxy(req("/api/summary", `${lock.SESSION_COOKIE}=${token}`)).status).toBe(200);
  });
});
