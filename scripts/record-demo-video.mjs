#!/usr/bin/env node
// A ~30-second silent walk through the demo household for the website (website/assets/tour-{he,en}.webm).
// 1. npm run demo   2. node scripts/record-demo-video.mjs [base-url]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? `http://127.0.0.1:${process.env.PENNY_DEMO_PORT ?? 3000}`;
const SIZE = { width: 1280, height: 800 };
const STOPS = ["/", "/optimizations", "/budget", "/transactions", "/overview"];

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
for (const lang of ["he", "en"]) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "penny-video-"));
  // Log in first in a context without recording, so the video starts on the dashboard.
  const setup = await browser.newContext({ viewport: SIZE, locale: lang === "he" ? "he-IL" : "en-US" });
  await setup.addCookies([{ name: "NEXT_LOCALE", value: lang, url: BASE }]);
  const p0 = await setup.newPage();
  await p0.goto(`${BASE}/profiles`);
  await p0.getByRole("button", { name: lang === "he" ? "דנה" : /Dana|דנה/ }).first().click();
  await p0.waitForURL((u) => !u.pathname.startsWith("/profiles"));
  const state = await setup.storageState();
  await setup.close();

  const ctx = await browser.newContext({ viewport: SIZE, colorScheme: "light", storageState: state, locale: lang === "he" ? "he-IL" : "en-US", recordVideo: { dir: tmp, size: SIZE } });
  // "Who's using?" is asked once per browser session (sessionStorage), which storageState doesn't carry.
  await ctx.addInitScript((key) => { try { sessionStorage.setItem(key, "1"); } catch {} }, "penny.profileChosen");
  const page = await ctx.newPage();
  for (const stop of STOPS) {
    await page.goto(`${BASE}${stop}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // A slow scroll down and back, so each screen shows more than its top.
    for (let y = 0; y <= 600; y += 30) { await page.mouse.wheel(0, 30); await page.waitForTimeout(40); }
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(900);
  }
  const video = page.video();
  await ctx.close();
  const out = path.join(ROOT, "website", "assets", `tour-${lang}.webm`);
  fs.copyFileSync(await video.path(), out);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${out} ${Math.round(fs.statSync(out).size / 1024)} KB`);
}
await browser.close();
