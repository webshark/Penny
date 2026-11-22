// Penny desktop: starts the bundled Next.js server with Electron's own Node and shows it in a window.
// No Node install, no terminal. Data lives in the per-user app folder; scrapers use the installed Chrome or Edge.
const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { downloadUpdate } = require("./update.cjs");

// The data folder is named after the product.
app.setName("Penny");
app.setPath("userData", path.join(app.getPath("appData"), "Penny"));

let server = null;
let win = null;
/** A downloaded, checksum-verified installer waiting to run. */
let pendingUpdate = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

/** The installed Chrome or Edge, so the bank scrapers need no browser download. */
function findBrowser() {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
          path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
          path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
          path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
          path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

/** A free port on localhost, so a second app or dev server never clashes. */
function freePort(preferred = 0, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (e) => (preferred ? resolve(freePort(0, host)) : reject(e)));
    s.listen(preferred, host, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function start() {
  // Packaged: the server ships in resources/server. In development: the standalone build in the repo.
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "..", ".next", "standalone");
  const entry = path.join(serverDir, "server.js");
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox("Penny", `The app files are missing (${entry}). Reinstall Penny.`);
    return app.quit();
  }
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  // Phone access (Settings > Privacy) listens on the network, on a fixed port so the phone URL stays the same.
  // Phone access only behind the app lock: a leftover flag without a lock never opens the network.
  const lan = fs.existsSync(path.join(dataDir, "lan-access.json")) && fs.existsSync(path.join(dataDir, ".app-lock.json"));
  const host = lan ? "0.0.0.0" : "127.0.0.1";
  const port = await freePort(lan ? 41234 : 0, host);
  const browser = findBrowser();

  server = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      HOSTNAME: host,
      PENNY_LISTEN_HOST: host,
      PENNY_RESTARTABLE: "1",
      PENNY_INSTALL: "desktop",
      PENNY_DATA_DIR: dataDir,
      ...(browser ? { PUPPETEER_EXECUTABLE_PATH: browser } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const log = fs.createWriteStream(path.join(app.getPath("userData"), "server.log"), { flags: "a" });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.on("exit", (code) => {
    if (code === 75) {
      // Restart asked from Settings (phone access changed): relaunch so the server binds again.
      app.isQuitting = true;
      app.relaunch();
      return app.exit(0);
    }
    if (!app.isQuitting) dialog.showErrorBox("Penny", `Penny stopped unexpectedly (code ${code}). Details: ${path.join(app.getPath("userData"), "server.log")}`);
  });

  const url = `http://127.0.0.1:${port}`;
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 380,
    show: false,
    title: "Penny",
    backgroundColor: "#f5f5fa",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Links to other sites open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, target) => {
    if (!target.startsWith(url)) {
      e.preventDefault();
      shell.openExternal(target);
    }
  });
  win.once("ready-to-show", () => win.show());

  if (!(await waitFor(`${url}/api/health`))) {
    dialog.showErrorBox("Penny", "Penny did not start in time. Try opening it again.");
    return app.quit();
  }
  await win.loadURL(url);
}

const he = () => app.getLocale().startsWith("he");

/** Runs the installer silently after this process exits; with `relaunch` it opens Penny again when done. */
function runInstaller(relaunch) {
  if (!pendingUpdate) return;
  spawn(pendingUpdate.file, ["/S", ...(relaunch ? ["--force-run"] : [])], { detached: true, stdio: "ignore" }).unref();
  pendingUpdate = null;
}

/** Windows only: fetch a newer release in the background, then ask to restart (or install on quit). Off with PENNY_UPDATE_CHECK=0. */
async function checkForUpdate() {
  if (process.platform !== "win32" || !app.isPackaged || pendingUpdate || process.env.PENNY_UPDATE_CHECK === "0") return;
  try {
    const found = await downloadUpdate({
      repo: process.env.PENNY_UPDATE_REPO || "Sergey-Bar/Penny",
      current: app.getVersion(),
      dir: path.join(app.getPath("temp"), "penny-update"),
      log: (m) => console.error(m),
    });
    if (!found || !win) return;
    pendingUpdate = found;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: he() ? ["הפעלה מחדש עכשיו", "אחר כך"] : ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: he() ? `גרסה ${found.version} מוכנה` : `Penny ${found.version} is ready`,
      detail: he()
        ? "ההתקנה לוקחת כמה שניות והנתונים שלכם נשארים כמו שהם. אם תבחרו אחר כך, היא תותקן כשתסגרו את האפליקציה."
        : "It installs in a few seconds and your data stays as it is. Choose Later to install it when you close Penny.",
    });
    if (response === 0) {
      runInstaller(true);
      app.quit();
    }
  } catch (err) {
    console.error("[update]", err && err.message);
  }
}

app.whenReady().then(async () => {
  await start();
  setTimeout(() => void checkForUpdate(), 30_000).unref?.();
  setInterval(() => void checkForUpdate(), 6 * 60 * 60 * 1000).unref?.();
});
app.on("before-quit", () => {
  app.isQuitting = true;
  if (server && !server.killed) server.kill();
  runInstaller(false);
});
app.on("window-all-closed", () => app.quit());
