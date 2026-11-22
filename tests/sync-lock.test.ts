import { describe, it, expect, afterEach } from "vitest";
import { isSyncRunning, SyncBusyError, tryAcquireSync } from "@/server/sync/lock";

afterEach(() => {
  globalThis.__spentSyncLock = undefined;
});

describe("sync lock", () => {
  it("lets one run hold the lock and refuses the second", () => {
    const release = tryAcquireSync("manual");
    expect(release).not.toBeNull();
    expect(isSyncRunning()).toBe(true);
    expect(tryAcquireSync("scheduled")).toBeNull();
    release?.();
    expect(isSyncRunning()).toBe(false);
    expect(tryAcquireSync("scheduled")).not.toBeNull();
  });

  it("releases only once, and never releases a newer lock", () => {
    const first = tryAcquireSync("manual");
    first?.();
    first?.();
    const second = tryAcquireSync("manual");
    first?.();
    expect(isSyncRunning()).toBe(true);
    second?.();
    expect(isSyncRunning()).toBe(false);
  });

  it("takes over a lock older than the stale window", () => {
    globalThis.__spentSyncLock = { kind: "manual", since: Date.now() - 46 * 60_000 };
    expect(isSyncRunning()).toBe(false);
    expect(tryAcquireSync("manual")).not.toBeNull();
  });

  it("carries a recognisable name for callers that cannot import the class", () => {
    expect(new SyncBusyError().name).toBe("SyncBusyError");
  });
});
