#!/usr/bin/env node
// Captures the website's product screenshots (website/assets/shots/{he,en}) from the demo household, so the site
// always shows the current app. Desktop shots are the top of each screen at 1440×900; phone shots are 375×812 at 1.5×.
// 1. npm run demo     2. node scripts/capture-site-shots.mjs [base-url]
// Never point it at your own data: it screenshots whatever the server shows.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? `http://127.0.0.1:${process.env.PENNY_DEMO_PORT ?? 3000}`;
const OUT = path.join(ROOT, "website", "assets", "shots");

const DESKTOP = {
  home: "/", transactions: "/transactions", budget: "/budget", summary: "/overview", ahead: "/overview?tab=ahead",
  investments: "/investments", fi: "/fi", calculators: "/calculators", mortgage: "/calculators/mortgage",
  learn: "/learn", life: "/life", wellbeing: "/wellbeing", recap: "/recap", a11y: "/settings/accessibility",
};
const PHONE = { "m-home": "/", "m-budget": "/budget", "m-transactions": "/transactions", "m-future": "/fi", "m-more": "/more" };

if (!(await fetch(`${BASE}/api/health`).catch(() => null))?.ok) {
  console.error(`No app at ${BASE}. Start the demo first: npm run demo`);
  process.exit(1);
}
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
for (const lang of ["he", "en"]) {
  for (const [shots, viewport, scale] of [[DESKTOP, { width: 1440, height: 900 }, 1], [PHONE, { width: 375, height: 812 }, 1.5]]) {
    const phone = viewport.width < 500;
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: phone, hasTouch: phone, colorScheme: "light", locale: lang === "he" ? "he-IL" : "en-US", reducedMotion: "reduce" });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: lang, url: BASE }]);
    const page = await ctx.newPage();
    page.on("dialog", (d) => void d.accept()); // the guide asks "hide for good?"
    await page.goto(`${BASE}/profiles`);
    await page.getByRole("button", { name: lang === "he" ? "דנה" : /Dana|דנה/ }).first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/profiles"));
    // The first-run guide is real but covers the home screen; hide it for good in the demo before shooting.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /להסתיר לצמיתות|Dismiss permanently/ }).first().click({ timeout: 3000 }).catch(() => {});
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    for (const [name, url] of Object.entries(shots)) {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      // Close any first-run guide or toast so the shot shows the screen itself.
      await page.keyboard.press("Escape").catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
      const png = await page.screenshot();
      await sharp(png).webp({ quality: 80 }).toFile(path.join(OUT, lang, `${name}.webp`));
      process.stdout.write(`${lang} ${name}\n`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`Done: ${OUT}`);
