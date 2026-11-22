import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_BLOCKED_MESSAGE, isDemoMode } from "@/server/demo/mode";
import { demoBlockedResponse } from "@/server/demo/guard";

describe("demo outbound guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answers with one message and 403 in demo mode", async () => {
    vi.stubEnv("PENNY_DEMO", "1");
    expect(isDemoMode()).toBe(true);
    const res = demoBlockedResponse();
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: DEMO_BLOCKED_MESSAGE });
  });

  it("stays out of the way of a normal install", () => {
    vi.stubEnv("PENNY_DEMO", "");
    expect(demoBlockedResponse()).toBeNull();
  });
});
