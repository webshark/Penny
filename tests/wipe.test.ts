import { describe, it, expect, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

vi.mock("@/server/sync/scheduler", () => ({ reschedule: () => undefined }));

const post = (body: unknown) =>
  new Request("http://127.0.0.1:3000/api/data/wipe", { method: "POST", body: JSON.stringify(body) });

describe("full wipe", () => {
  it("needs the word, then removes the database, key and logs and starts fresh", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-wipe-"));
    process.env.PENNY_DATA_DIR = dir;
    // ./data of the working directory is the "legacy" key location. In a checkout that is also a real install
    // that is the real key, and this suite would copy or shred it. Keep it inside the temp folder.
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    globalThis.__pennyDataKey = undefined;
    const { getDb } = await import("@/server/db/index");
    const { setGlobalSetting, getGlobalSetting } = await import("@/server/db/queries/settings");
    const { encrypt } = await import("@/server/lib/encryption");
    encrypt("x");
    setGlobalSetting("telegram_chat_id", "9");
    fs.writeFileSync(path.join(dir, "sync.log"), "log");
    const { POST } = await import("@/app/api/data/wipe/route");

    expect((await POST(post({ confirm: "nope" }))).status).toBe(400);
    expect(getGlobalSetting("telegram_chat_id")).toBe("9");

    expect((await POST(post({ confirm: "מחיקה" }))).status).toBe(200);
    expect(fs.existsSync(path.join(dir, ".encryption-key"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "sync.log"))).toBe(false);
    expect(getGlobalSetting("telegram_chat_id")).toBeNull();
    expect((getDb().prepare("SELECT COUNT(*) c FROM categories").get() as { c: number }).c).toBeGreaterThan(0);
  });
});
