// Starts `next start` for the background service. Binds 127.0.0.1, or 0.0.0.0 when phone access
// (<data>/lan-access.json, toggled in Settings > Privacy) is on. Exit code 75 from the app = restart.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.argv[2] ?? "41234";
const dir = process.env.PENNY_DATA_DIR ?? process.env.SPENT_DATA_DIR;
const data = dir ? path.resolve(dir) : path.join(root, "data");
const flag = path.join(data, "lan-access.json");
// Phone access only behind the app lock: a leftover flag without a lock never opens the network.
const lanAllowed = () => fs.existsSync(flag) && fs.existsSync(path.join(data, ".app-lock.json"));

function run() {
  const host = lanAllowed() ? "0.0.0.0" : "127.0.0.1";
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", host, "-p", port], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PENNY_LISTEN_HOST: host, PENNY_RESTARTABLE: "1" },
    windowsHide: true,
  });
  child.on("exit", (code) => (code === 75 ? run() : process.exit(code ?? 1)));
}
run();
