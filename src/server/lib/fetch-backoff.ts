import "server-only";

// On globalThis so every route shares it; in memory only, so a restart retries at once.
const g = globalThis as { __pennyFetchFails?: Map<string, number> };
const fails = (g.__pennyFetchFails ??= new Map<string, number>());

/** A remote source that failed recently: skip it (use the cached copy) instead of waiting on its timeout again. */
export const recentlyFailed = (key: string, now = Date.now()) => (fails.get(key) ?? 0) > now;

export const markFailed = (key: string, ms = 15 * 60_000, now = Date.now()) => void fails.set(key, now + ms);
