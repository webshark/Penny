import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import { NextRequest } from "next/server";
import { isAllowedHost, isPrivateLanName } from "@/lib/host-guard";

describe("isPrivateLanName", () => {
  it("accepts private ranges and .local names", () => {
    for (const n of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.20", "[fe80::1]", "[febf::1]", "mypc.local", "my-pc.home.local"]) {
      expect(isPrivateLanName(n)).toBe(true);
    }
  });
  it("rejects public, out-of-range and lookalike names", () => {
    for (const n of ["8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.1.1", "11.0.0.1", "192.168.1.256", "[2001:db8::1]", "[fec0::1]", "evil.com", "local", "x.local.evil.com", "10.0.0.1.evil.com"]) {
      expect(isPrivateLanName(n)).toBe(false);
    }
  });
});

describe("isAllowedHost with phone access", () => {
  it("allows LAN hosts only when enabled, never public ones", () => {
    expect(isAllowedHost("192.168.1.20:41234", [])).toBe(false);
    expect(isAllowedHost("192.168.1.20:41234", [], true)).toBe(true);
    expect(isAllowedHost("[fe80::1]:41234", [], true)).toBe(true);
    expect(isAllowedHost("8.8.8.8:41234", [], true)).toBe(false);
    expect(isAllowedHost("evil.com", [], true)).toBe(false);
    expect(isAllowedHost("127.0.0.1:41234", [], true)).toBe(true);
  });
});

describe("proxy gate for LAN requests", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-lan-"));
    process.env.PENNY_DATA_DIR = dataDir;
    vi.spyOn(process, "cwd").mockReturnValue(dataDir); // see tests/app-lock.test.ts: stay out of the real ./data
    vi.resetModules();
    globalThis.__pennyDataKey = undefined;
    globalThis.__pennySessions = undefined;
    globalThis.__pennyUnlockFails = undefined;
  });
  const req = (p: string, cookie?: string) =>
    new NextRequest(`http://192.168.1.20:41234${p}`, { headers: { host: "192.168.1.20:41234", ...(cookie ? { cookie } : {}) } });

  it("blocks LAN hosts while phone access is off, and while the lock is off even if the flag is set", async () => {
    const { proxy } = await import("@/proxy");
    expect(proxy(req("/")).status).toBe(403);
    fs.writeFileSync(path.join(dataDir, "lan-access.json"), "{}");
    expect(proxy(req("/")).status).toBe(403);
  });

  it("with phone access and the lock on: only the unlock page without a session", async () => {
    const enc = await import("@/server/lib/encryption");
    const lock = await import("@/server/lib/app-lock");
    const lan = await import("@/server/lib/lan-access");
    enc.encrypt("x"); // creates the key
    await lock.enableLock("hunter2hunter2", 15);
    lan.setLanEnabled(true);
    const { proxy } = await import("@/proxy");
    expect(proxy(req("/lock")).status).toBe(200);
    expect(proxy(req("/transactions")).status).toBe(307);
    expect(proxy(req("/api/summary")).status).toBe(401);
    const token = lock.createSession();
    expect(proxy(req("/api/summary", `${lock.SESSION_COOKIE}=${token}`)).status).toBe(200);
    lan.setLanEnabled(false);
    expect(proxy(req("/lock")).status).toBe(403);
  });
});
