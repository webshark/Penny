#!/usr/bin/env node
// The website's social preview (website/assets/og-{he,en}.jpg, 1200×630): the brand, one line, and the real
// dashboard from the demo screenshots. Run after scripts/capture-demo-tour.mjs: node scripts/make-og-image.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COPY = {
  he: { dir: "rtl", title: "כסף רגוע למשק הבית", line: "הבנקים, התקציב והעתיד במקום אחד. על המחשב שלכם, בחינם.", tag: "קוד פתוח · בלי ענן" },
  en: { dir: "ltr", title: "Calm money for your household", line: "Banks, budget and future in one place. On your computer, free.", tag: "Open source · No cloud" },
};

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [lang, c] of Object.entries(COPY)) {
  const shot = fs.readFileSync(path.join(ROOT, "website", "demo", lang, "home.webp")).toString("base64");
  await page.setContent(`<!doctype html><html><head><style>
    /* The page stays LTR (an RTL page with an image past its edge scrolls sideways); only the text is RTL. */
    body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:"Segoe UI",Rubik,Arial,sans-serif;color:#fff;
      background:radial-gradient(900px 500px at ${c.dir === "rtl" ? "100%" : "0%"} 0%,#6c55e0,transparent 70%),linear-gradient(135deg,#2a1f6b,#14102e)}
    .text{position:absolute;top:70px;${c.dir === "rtl" ? "right" : "left"}:70px;width:470px}
    .brand{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700}
    .mark{width:52px;height:52px;border-radius:15px;background:linear-gradient(135deg,#7b64f0,#4a37b8);display:flex;align-items:center;justify-content:center;gap:6px}
    .mark i{width:9px;height:15px;background:#fff;border-radius:5px}
    h1{font-size:54px;line-height:1.08;margin:44px 0 18px;letter-spacing:-.01em}
    p{font-size:25px;line-height:1.4;margin:0;color:#d9d3ff}
    .tag{display:inline-block;margin-top:30px;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.14);font-size:20px}
    .shot{position:absolute;top:80px;${c.dir === "rtl" ? "left" : "right"}:-170px;width:760px;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);transform:perspective(1600px) rotateY(${c.dir === "rtl" ? 10 : -10}deg)}
  </style></head><body>
    <img class="shot" src="data:image/webp;base64,${shot}">
    <div class="text" dir="${c.dir}"><div class="brand"><span class="mark"><i></i><i></i></span>Penny</div><h1>${c.title}</h1><p>${c.line}</p><span class="tag">${c.tag}</span></div>
  </body></html>`);
  await page.waitForTimeout(200);
  await sharp(await page.screenshot()).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(ROOT, "website", "assets", `og-${lang}.jpg`));
  console.log(`og-${lang}.jpg`);
}
await browser.close();
