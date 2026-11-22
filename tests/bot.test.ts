import { describe, it, expect, beforeAll, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

type Cmd = typeof import("@/server/bot/commands");
let cmd: Cmd;
let ws: number;
const cfg = { chatId: 42, billingDay: 10 };
const deps = () => ({ workspaceId: ws, today: "2026-11-04", runSync: async () => "synced" });

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-bot-"));
  vi.spyOn(process, "cwd").mockReturnValue(process.env.PENNY_DATA_DIR); // see tests/app-lock.test.ts: stay out of the real ./data
  const db = (await import("@/server/db/index")).getDb();
  cmd = await import("@/server/bot/commands");
  const { createSyncRun } = await import("@/server/db/queries/sync-runs");
  const { insertTransactions } = await import("@/server/db/queries/transactions");
  ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const cred = db
    .prepare("INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag) VALUES (?, 'isracard', 'T', x'00', x'00', x'00')")
    .run(ws).lastInsertRowid as number;
  const run = createSyncRun(ws, "isracard", cred, "2026-08-01");
  const b = { accountNumber: "1", type: "normal" as const, originalCurrency: "ILS", status: "completed" as const };
  const row = (date: string, amount: number, description: string, extra = {}) => ({
    ...b, date: `${date}T00:00:00.000Z`, processedDate: `${date}T00:00:00.000Z`, originalAmount: amount, chargedAmount: amount, description, ...extra,
  });
  insertTransactions(ws, [
    row("2026-08-05", -50, "Netflix"), row("2026-09-05", -50, "Netflix"), row("2026-10-05", -50, "Netflix"),
    row("2026-11-02", -300, "שופרסל"),
    row("2026-10-10", -100, "IKEA", { type: "installments" as const, installmentNumber: 1, installmentTotal: 4 }),
  ], "isracard", cred, run);
});

describe("splitMessage", () => {
  it("splits on line breaks under Telegram's limit and loses nothing", () => {
    const text = Array.from({ length: 100 }, (_, i) => `${i} ${"x".repeat(95)}`).join("\n");
    const parts = cmd.splitMessage(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
    expect(parts.join("\n")).toBe(text);
  });
  it("hard-splits a single line longer than the limit", () => {
    const parts = cmd.splitMessage("y".repeat(9000));
    expect(parts.map((p) => p.length)).toEqual([4000, 4000, 1000]);
  });
});

describe("splitMessage edge cases", () => {
  it("never produces an empty part", () => {
    expect(cmd.splitMessage("\n" + "z".repeat(4500)).every((p) => p.length > 0)).toBe(true);
  });
  it("does not cut an emoji in half", () => {
    const parts = cmd.splitMessage("a" + "😀".repeat(3000));
    expect(parts.join("")).toBe("a" + "😀".repeat(3000));
    expect(parts.every((p) => !/[\uD800-\uDBFF]$/.test(p))).toBe(true);
  });
});

describe("handleCommand", () => {
  it("ignores messages from any other chat", async () => {
    expect(await cmd.handleCommand("/month", 999, cfg, deps())).toBeNull();
  });
  it("/month reports this month's spending total", async () => {
    const out = (await cmd.handleCommand("/month", 42, cfg, deps()))!;
    expect(out).toContain("300");
  });
  it("/subs lists the detected subscription", async () => {
    const out = (await cmd.handleCommand("/subs", 42, cfg, deps()))!;
    expect(out.toLowerCase()).toContain("netflix");
  });
  it("/forecast lists the next 3 billing dates", async () => {
    const out = (await cmd.handleCommand("/forecast", 42, cfg, deps()))!;
    // Seeded charges mostly bill on the 5th, so the card's billing day is derived as 5, not the configured 10.
    for (const d of ["2026-11-05", "2026-12-05", "2027-01-05"]) expect(out).toContain(d);
  });
  it("/sync runs the injected sync and reports its summary", async () => {
    expect(await cmd.handleCommand("/sync", 42, cfg, deps())).toContain("synced");
  });
  it("says setup is needed when there is no workspace", async () => {
    const out = await cmd.handleCommand("/month", 42, cfg, { ...deps(), workspaceId: undefined });
    expect(out).toContain("לא מוגדרת");
  });
  it("/sync refuses to start a second sync while one is running", async () => {
    let called = false;
    const out = await cmd.handleCommand("/sync", 42, cfg, {
      ...deps(),
      isSyncRunning: () => true,
      runSync: async () => { called = true; return "synced"; },
    });
    expect(out).toContain("סנכרון כבר רץ");
    expect(called).toBe(false);
  });
  it("unknown text gets the help list", async () => {
    expect(await cmd.handleCommand("hello", 42, cfg, deps())).toContain("/month");
  });
});

describe("snapshot commands", () => {
  it("answers /short and its keyboard label with the same three-line snapshot", async () => {
    const short = await cmd.handleCommand("/short", 42, cfg, deps());
    expect(short).toContain("הוצאות החודש");
    expect(await cmd.handleCommand(cmd.SHORT_LABEL, 42, cfg, deps())).toBe(short);
  });

  it("full snapshot extends the short one and ignores other chats", async () => {
    const full = await cmd.handleCommand(cmd.FULL_LABEL, 42, cfg, deps());
    expect(full).toContain("תמונת מצב");
    expect(full).toContain("סנכרון אחרון");
    expect(await cmd.handleCommand("/full", 7, cfg, deps())).toBeNull();
  });
});

describe("formatShort", () => {
  const base = { monthTotal: 1200, topCategories: [], bills: [], subs: [], lastSync: null };
  const cash = { bank: 0, billsDue: 0, salaryExpected: 0, until: "2026-12-01", daysLeft: 25 };
  it("says how much is missing when below zero, and handles no bank", async () => {
    const { formatShort } = await import("@/server/bot/snapshot");
    expect(formatShort({ ...base, cash: { ...cash, safeToSpend: -500 } })).toMatch(/חסרים ₪500/);
    expect(formatShort({ ...base, cash: { ...cash, safeToSpend: null } })).toMatch(/אין יתרת בנק/);
    expect(formatShort({ ...base, cash: { ...cash, safeToSpend: 2500 } })).toMatch(/₪100 ליום/);
  });
});

describe("linkChat", () => {
  it("links only with the issued code, once", async () => {
    const c = await import("@/server/bot/config");
    c.saveBot("123:abc", "penny_bot");
    expect(c.linkChat("wrong", 9)).toBe(false);
    expect(c.linkChat(c.getBotConfig().code!, 9)).toBe(true);
    expect(c.getBotConfig()).toMatchObject({ chatId: 9, token: "123:abc", code: null });
    c.clearBot();
  });
});

describe("hide amounts in Telegram", () => {
  it("replaces every amount with dots in all commands", async () => {
    const hidden = { ...cfg, hideAmounts: true };
    for (const c of ["/short", "/full", "/month", "/subs", "/forecast"]) {
      const out = (await cmd.handleCommand(c, 42, hidden, deps()))!;
      expect(out, c).not.toMatch(/₪\d/);
    }
    expect(await cmd.handleCommand("/month", 42, hidden, deps())).toContain("•••");
  });
});

describe("spend feedback after sync", () => {
  it("shows new expenses with budget left, and nothing when no new rows", async () => {
    const { spendFeedback } = await import("@/server/bot/feedback");
    const db = (await import("@/server/db/index")).getDb();
    const tx = db.prepare("SELECT id, category_id FROM transactions WHERE description = 'שופרסל'").get() as { id: number; category_id: number | null };
    const catId = tx.category_id ?? (db.prepare("SELECT id FROM categories LIMIT 1").get() as { id: number }).id;
    db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(catId, tx.id);
    db.prepare("INSERT OR REPLACE INTO budgets (workspace_id, category_id, monthly_amount, is_auto) VALUES (?, ?, 1000, 0)").run(ws, catId);

    const out = spendFeedback(ws, "2000-01-01 00:00:00", "2026-11-04")!;
    expect(out).toContain("שופרסל");
    expect(out).toContain("נשארו ₪700");
    expect(spendFeedback(ws, "2999-01-01 00:00:00", "2026-11-04")).toBeNull();
    expect(spendFeedback(ws, "2000-01-01 00:00:00", "2026-11-04", true)).not.toMatch(/₪\d/);
  });
});

describe("inline menu", () => {
  it("has every tab mapped to a command the bot answers, under Telegram's 64-byte limit", async () => {
    const rows = cmd.menuMarkup("/month").inline_keyboard.flat();
    expect(rows).toHaveLength(cmd.MENU_TABS.length);
    expect(rows.find((b) => b.callback_data === "m:/month")!.text).toContain("·");
    for (const b of rows) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    for (const c of ["/menu", "/start", cmd.MENU_LABEL])
      expect(await cmd.handleCommand(c, 42, cfg, deps())).toBe(await cmd.handleCommand("/short", 42, cfg, deps()));
  });
});

describe("categorize in chat", () => {
  it("walks the queue, assigns, and turns a tap into a rule", async () => {
    const { categorizeCard, categorizeAction } = await import("@/server/bot/categorize");
    const db = (await import("@/server/db/index")).getDb();
    db.prepare("UPDATE transactions SET category_id = NULL, category_source = NULL WHERE description = 'IKEA'").run();
    const first = categorizeCard(ws);
    expect(first.text).toContain("🏷 סיווג");
    const all = first.markup.inline_keyboard.flat().find((b) => b.callback_data.startsWith("c:m:"))!;
    const picker = categorizeAction(ws, all.callback_data)!;
    const pick = picker.markup.inline_keyboard.flat().find((b) => b.callback_data.startsWith("c:a:"))!;
    for (const b of picker.markup.inline_keyboard.flat()) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);

    const before = db.prepare("SELECT COUNT(*) n FROM transactions WHERE category_id IS NULL AND kind = 'expense'").get() as { n: number };
    const after = categorizeAction(ws, pick.callback_data)!;
    expect(after.text).toContain("✓");
    const n = (db.prepare("SELECT COUNT(*) n FROM transactions WHERE category_id IS NULL AND kind = 'expense'").get() as { n: number }).n;
    expect(n).toBe(before.n - 1);

    const ruleBtn = after.markup.inline_keyboard[0][0];
    expect(ruleBtn.callback_data).toMatch(/^c:r:/);
    expect(categorizeAction(ws, ruleBtn.callback_data)!.text).toContain("📌 נוצר כלל");
    expect(categorizeAction(ws, "c:a:999999:1:0")!.text).toContain("כבר לא קיימת");
    expect(categorizeAction(ws, "c:a:x:y:z")).not.toBeNull();
  });
});
