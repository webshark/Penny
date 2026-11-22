import "server-only";

export type SyncLockKind = "manual" | "scheduled";

interface SyncLockState {
  kind: SyncLockKind;
  since: number;
}

declare global {
  var __spentSyncLock: SyncLockState | undefined;
}

/**
 * A scrape times out after a minute and a full run is minutes at worst, so a lock older than this
 * means the run died without releasing. Without it one hung scrape would block every later sync.
 */
const STALE_MS = 45 * 60 * 1000;

export class SyncBusyError extends Error {
  constructor() {
    super("A sync is already running.");
    this.name = "SyncBusyError";
  }
}

export function isSyncRunning(now = Date.now()): boolean {
  const lock = globalThis.__spentSyncLock;
  if (!lock) return false;
  if (now - lock.since > STALE_MS) {
    console.warn("[sync] releasing a stale sync lock");
    globalThis.__spentSyncLock = undefined;
    return false;
  }
  return true;
}

/** Returns the release function, or null when another sync already holds the lock. */
export function tryAcquireSync(kind: SyncLockKind): (() => void) | null {
  if (isSyncRunning()) return null;
  const state: SyncLockState = { kind, since: Date.now() };
  globalThis.__spentSyncLock = state;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (globalThis.__spentSyncLock === state) globalThis.__spentSyncLock = undefined;
  };
}
