#!/usr/bin/env node
// A demo household with made-up data, in its own data folder, so your real
// Penny database is never touched:
//   npm run demo       -> fresh demo data, then the app on http://127.0.0.1:3000
//   npm run dev:demo   -> the app again, keeping the demo data you changed
//   npm run demo:reset -> only clear the demo data
// The seed itself runs inside the app on first open (src/server/demo/seed.ts),
// so it uses the same migrations and category tree as a real install.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Only this exact folder is ever deleted; the guard below protects a mistyped path.
// Outside the project: inside it, the dev server saw every database write as a file change and reloaded the page in a loop.
const DEMO_DATA = path.join(os.tmpdir(), "penny-demo-data");
// Some launchers export PORT=0 ("pick any port"), which would move the demo off the URL it prints.
// PENNY_DEMO_PORT or a real PORT can still change it.
const requestedPort = process.env.PENNY_DEMO_PORT || process.env.PORT;
const PORT = requestedPort && requestedPort !== "0" ? requestedPort : "3000";
const keep = process.argv.includes("--keep");
const resetOnly = process.argv.includes("--reset-only");

function clearDemoData() {
  if (!fs.existsSync(DEMO_DATA)) return;
  if (path.basename(DEMO_DATA) !== "penny-demo-data" || path.dirname(DEMO_DATA) !== os.tmpdir()) {
    console.error(`demo: refusing to delete ${DEMO_DATA}`);
    process.exit(1);
  }
  try {
    fs.rmSync(DEMO_DATA, { recursive: true, force: true });
  } catch (err) {
    console.error(`\ndemo: could not clear ${DEMO_DATA}.`);
    console.error("Close the running demo (Ctrl+C) and try again.\n", err.message);
    process.exit(1);
  }
  console.log("demo: cleared the old demo household.");
}

if (!keep) clearDemoData();
if (resetOnly) {
  console.log("demo: run `npm run dev:demo` to start it again.");
  process.exit(0);
}

const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
if (!fs.existsSync(nextBin)) {
  console.error("demo: Next.js is missing. Run `npm install` first.");
  process.exit(1);
}

console.log(`
  Penny demo on http://127.0.0.1:${PORT}
  A made-up household (דנה ויואב) with two bank accounts, two cards, open
  banking, three investment houses and five months of history. Every
  connection screen is filled in, but sync and AI are off: nothing leaves this app.
  Nothing here is real and no bank login is needed.
  Press Ctrl+C to stop.
`);

const child = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(PORT)], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, PENNY_DATA_DIR: DEMO_DATA, PENNY_DEMO: "1" },
});

child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
