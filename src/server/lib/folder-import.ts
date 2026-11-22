import "server-only";

import fs from "fs";
import path from "path";
import { getGlobalSetting, setGlobalSetting } from "@/server/db/queries/settings";
import {
  countBatchCategories,
  flagBatchForReview,
  getAccountNumbers,
  insertFileImport,
  storedForImport,
} from "@/server/db/queries/transactions";
import { applyMerchantRulesToSyncRun } from "@/server/db/queries/excluded-merchants";
import { applyRulesToSyncRun } from "@/server/db/queries/rules";
import { isKeyLocked } from "@/server/lib/encryption";
import { dataDir } from "@/server/lib/data-dir";
import { validateDir } from "@/server/lib/legacy-export";
import { getDb } from "@/server/db";
import { IMPORT_EXTS, markDuplicates, MAX_IMPORT_ROWS, statementRows, type ImportRow } from "@/lib/file-import";

/** Dedupe against stored rows, insert, then the same merchant memory and rules a bank sync gets. Shared by /api/import and the folder scan. */
export function saveStatementImport(
  workspaceId: number,
  account: string,
  rows: ImportRow[],
  dryRun = false,
  source: "bank" | "card" = "bank",
) {
  const dates = rows.map((r) => r.date).sort();
  const marked = markDuplicates(rows, storedForImport(workspaceId, account, dates[0], dates[dates.length - 1]));
  const fresh = marked.filter((r) => !r.duplicate);
  const duplicates = marked.length - fresh.length;
  if (dryRun || fresh.length === 0) {
    return { ready: fresh.length, duplicates, added: 0, batchId: null as number | null, categorized: 0, needsReview: 0 };
  }
  const { batchId, added } = insertFileImport(workspaceId, account, fresh, source);
  applyMerchantRulesToSyncRun(workspaceId, batchId);
  applyRulesToSyncRun(workspaceId, batchId);
  // Whatever the rules did not cover waits in the review queue instead of sitting invisible.
  const needsReview = flagBatchForReview(workspaceId, batchId);
  const { categorized } = countBatchCategories(workspaceId, batchId);
  return {
    ready: fresh.length,
    duplicates: duplicates + fresh.length - added,
    added,
    batchId: batchId as number | null,
    categorized,
    needsReview,
  };
}

// ---- pure file handling (tested) ----

/** Browser partial downloads and Office lock files. */
const isTemp = (name: string) => name.startsWith("~$") || name.startsWith(".") || /\.(crdownload|part|partial|tmp|download)$/i.test(name);
export const isImportable = (name: string) => !isTemp(name) && IMPORT_EXTS.includes(path.extname(name).toLowerCase());

export type Seen = Record<string, string>; // file name -> "size:mtimeMs" from the previous scan

/** Supported files in dir (top level only) whose size and mtime did not change since the last scan. Returns them plus the new snapshot. */
export function pickStableFiles(dir: string, prev: Seen): { ready: string[]; seen: Seen } {
  const seen: Seen = {};
  const ready: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !isImportable(e.name)) continue;
    const st = fs.statSync(path.join(dir, e.name));
    const sig = `${st.size}:${st.mtimeMs}`;
    seen[e.name] = sig;
    if (st.size > 0 && prev[e.name] === sig) ready.push(e.name);
  }
  return { ready, seen };
}

/** Moves dir/name into dir/sub/, never overwriting: a taken name gets " (2)", " (3)"… Returns the new path. */
export function moveInto(dir: string, name: string, sub: "imported" | "failed", note?: string): string {
  const target = path.join(dir, sub);
  fs.mkdirSync(target, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let dest = path.join(target, name);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(target, `${stem} (${n})${ext}`);
  fs.renameSync(path.join(dir, name), dest);
  if (note) fs.writeFileSync(`${dest}.error.txt`, note, "utf8");
  return dest;
}

/** Subfolder for one account, e.g. "max (1234)". The account number in brackets is what the scan reads back. */
export function folderNameFor(a: { accountNumber: string; label: string | null; provider: string }): string {
  const name = `${a.label || a.provider} (${a.accountNumber})`;
  return name.replace(/[<>:"/\|?*\u0000-\u001f]/g, "-").trim().slice(0, 80);
}

/** Account for a subfolder: the number in trailing brackets, else the folder name itself (a new account, e.g. a pension fund). */
export function accountForFolder(name: string): string {
  return (/\(([^()]+)\)\s*$/.exec(name)?.[1] ?? name).trim().slice(0, 40);
}

const SKIP_DIRS = new Set(["imported", "failed"]);

// ---- settings + scan ----

export interface FolderImportConfig {
  enabled: boolean;
  dir: string;
  defaultDir: string;
  account: string;
  minutes: number;
  lastScanAt: string | null;
  lastAddedAt: string | null;
  totalAdded: number;
  status: "ok" | "locked" | "error" | null;
  error: string | null;
  history: { at: string; file: string; added: number; duplicates: number; error: string | null }[];
}

const KEY = "folder_import";
const SEEN = "folder_import_seen";
export const defaultImportDir = () => path.join(dataDir(), "import");
const DEFAULT_ACCOUNT = "תיקיית ייבוא";
const clampMinutes = (n: unknown) => (Number.isFinite(Number(n)) ? Math.min(60, Math.max(1, Math.round(Number(n)))) : 5);

export function getFolderImportConfig(): FolderImportConfig {
  let s: Partial<FolderImportConfig> = {};
  try {
    s = JSON.parse(getGlobalSetting(KEY) ?? "{}");
  } catch {}
  const defaultDir = defaultImportDir();
  return {
    enabled: s.enabled !== false, // on by default: dropping a statement in the folder should just work
    dir: typeof s.dir === "string" && s.dir ? s.dir : defaultDir,
    defaultDir,
    account: typeof s.account === "string" && s.account.trim() ? s.account : DEFAULT_ACCOUNT,
    minutes: clampMinutes(s.minutes ?? 5),
    lastScanAt: s.lastScanAt ?? null,
    lastAddedAt: s.lastAddedAt ?? null,
    totalAdded: s.totalAdded ?? 0,
    status: s.status ?? null,
    error: s.error ?? null,
    history: Array.isArray(s.history) ? s.history : [],
  };
}

function save(c: FolderImportConfig) {
  const { defaultDir: _d, ...rest } = c;
  setGlobalSetting(KEY, JSON.stringify(rest));
  return getFolderImportConfig();
}

export function updateFolderImportConfig(patch: { enabled?: boolean; dir?: string; account?: string; minutes?: number }) {
  const c = getFolderImportConfig();
  if (patch.dir !== undefined) {
    c.dir = validateDir(patch.dir);
    fs.mkdirSync(c.dir, { recursive: true });
  }
  if (patch.account !== undefined) c.account = String(patch.account).trim().slice(0, 40) || DEFAULT_ACCOUNT;
  if (patch.minutes !== undefined) c.minutes = clampMinutes(patch.minutes);
  if (patch.enabled !== undefined) {
    c.enabled = patch.enabled === true;
    if (c.enabled) fs.mkdirSync(validateDir(c.dir), { recursive: true });
  }
  const saved = save(c);
  initFolderImportSchedule(); // interval may have changed
  return saved;
}

const firstWorkspace = () => (getDb().prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as { id: number }).id;

let running = false;

/**
 * One pass over the folder. `now` skips the two-scan stability wait (the "scan now" button).
 * Files go to imported/ or failed/ (+ .error.txt); nothing is deleted and nothing outside the folder is read.
 */
export async function scanImportFolder(now = false): Promise<FolderImportConfig> {
  if (running) return getFolderImportConfig();
  running = true;
  try {
    const c = getFolderImportConfig();
    if (isKeyLocked()) return save({ ...c, status: "locked", error: null });
    const dir = validateDir(c.dir);
    fs.mkdirSync(dir, { recursive: true });
    let prev: Seen = {};
    try {
      prev = JSON.parse(getGlobalSetting(SEEN) ?? "{}");
    } catch {}
    const workspaceId = firstWorkspace();
    // One subfolder per known account, so a downloaded statement lands on the right account.
    for (const a of getAccountNumbers(workspaceId)) fs.mkdirSync(path.join(dir, folderNameFor(a)), { recursive: true });
    const folders: { folder: string; account: string; prefix: string }[] = [{ folder: dir, account: c.account, prefix: "" }];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) folders.push({ folder: path.join(dir, e.name), account: accountForFolder(e.name), prefix: `${e.name}/` });
    }
    const seen: Seen = {};
    for (const { folder, account, prefix } of folders) {
      const mine = Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).map(([k, v]) => [k.slice(prefix.length), v]));
      const picked = pickStableFiles(folder, mine);
      const files = now ? Object.keys(picked.seen) : picked.ready;
      for (const name of files) {
        const label = prefix + name;
        const at = new Date().toISOString();
        try {
          const { rows, source } = await statementRows(new Uint8Array(fs.readFileSync(path.join(folder, name))), name);
          if (rows.length === 0) throw new Error("noRows");
          if (rows.length > MAX_IMPORT_ROWS) throw new Error("tooMany");
          const r = saveStatementImport(workspaceId, account, rows, false, source);
          moveInto(folder, name, "imported");
          c.history.unshift({ at, file: label, added: r.added, duplicates: r.duplicates, error: null });
          if (r.added > 0) {
            c.totalAdded += r.added;
            c.lastAddedAt = at;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message.slice(0, 200) : "failed";
          try {
            moveInto(folder, name, "failed", `${at}\n${msg}\n`);
          } catch {} // file vanished or locked: retried next scan
          c.history.unshift({ at, file: label, added: 0, duplicates: 0, error: msg });
        }
        delete picked.seen[name];
      }
      for (const [k, v] of Object.entries(picked.seen)) seen[prefix + k] = v;
    }
    setGlobalSetting(SEEN, JSON.stringify(seen));
    return save({ ...c, history: c.history.slice(0, 20), lastScanAt: new Date().toISOString(), status: "ok", error: null });
  } catch (e) {
    return save({ ...getFolderImportConfig(), lastScanAt: new Date().toISOString(), status: "error", error: e instanceof Error ? e.message.slice(0, 200) : "failed" });
  } finally {
    running = false;
  }
}

declare global {
  var __folderImportTimer: ReturnType<typeof setInterval> | undefined;
}

/** Every `minutes` (1–60, default 5) while enabled; a scan still running makes the next tick a no-op. */
export function initFolderImportSchedule() {
  if (globalThis.__folderImportTimer) clearInterval(globalThis.__folderImportTimer);
  globalThis.__folderImportTimer = undefined;
  let c: FolderImportConfig;
  try {
    c = getFolderImportConfig();
  } catch (e) {
    console.error("[folder-import] init failed:", e instanceof Error ? e.message : e);
    return;
  }
  if (!c.enabled) return;
  const tick = () => void scanImportFolder().catch((e) => console.error("[folder-import] scan failed:", e));
  globalThis.__folderImportTimer = setInterval(tick, c.minutes * 60_000);
  globalThis.__folderImportTimer.unref?.();
}
