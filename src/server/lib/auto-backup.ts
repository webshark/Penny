import "server-only";

import fs from "fs";
import os from "os";
import path from "path";
import { getGlobalSetting, setGlobalSetting } from "@/server/db/queries/settings";
import { decrypt, encrypt, isKeyLocked } from "@/server/lib/encryption";
import { createBackup, MIN_PASSPHRASE } from "@/server/lib/portable-backup";
import { validateDir } from "@/server/lib/legacy-export";

/**
 * Off-computer safety: an encrypted .pennybak written on a schedule into a folder the person picks, typically one
 * Google Drive, OneDrive, Dropbox or iCloud already syncs. The file opens only with the backup passphrase, so the
 * cloud never holds readable data. The passphrase is kept encrypted with the app's own key.
 */
const DAY = 86_400_000;
const PERIOD = { daily: DAY, weekly: 7 * DAY } as const;
export type BackupFrequency = keyof typeof PERIOD;
export const AUTO_BACKUP_KEEP = 7;
const NAME_RE = /^penny-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.pennybak$/;
const KEY = "auto_backup";
const SECRET = "auto_backup_secret";

export interface AutoBackupConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  dir: string;
  defaultDir: string;
  hasPassphrase: boolean;
  lastAt: string | null;
  lastFile: string | null;
  status: "ok" | "locked" | "error" | null;
  error: string | null;
}

export const defaultBackupDir = () => path.join(os.homedir(), "Documents", "Penny backups");

/** True when a backup is due: never made, or the period has passed (an hour early is fine, the check is hourly). */
export function backupDue(lastAt: string | null, frequency: BackupFrequency, now = Date.now()): boolean {
  return !lastAt || now - Date.parse(lastAt) >= PERIOD[frequency] - 3_600_000;
}

/** Of our own backup files in a folder, the ones beyond the newest `keep` (timestamps sort as text). */
export function backupsToPrune(names: string[], keep = AUTO_BACKUP_KEEP): string[] {
  const ours = names.filter((n) => NAME_RE.test(n)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}

export function getAutoBackupConfig(): AutoBackupConfig {
  let saved: Partial<AutoBackupConfig> = {};
  try {
    saved = JSON.parse(getGlobalSetting(KEY) ?? "{}");
  } catch {}
  const defaultDir = defaultBackupDir();
  return {
    enabled: saved.enabled === true,
    frequency: saved.frequency === "weekly" ? "weekly" : "daily",
    dir: typeof saved.dir === "string" && saved.dir ? saved.dir : defaultDir,
    defaultDir,
    hasPassphrase: !!getGlobalSetting(SECRET),
    lastAt: saved.lastAt ?? null,
    lastFile: saved.lastFile ?? null,
    status: saved.status ?? null,
    error: saved.error ?? null,
  };
}

function save(c: AutoBackupConfig) {
  const rest = { enabled: c.enabled, frequency: c.frequency, dir: c.dir, lastAt: c.lastAt, lastFile: c.lastFile, status: c.status, error: c.error };
  setGlobalSetting(KEY, JSON.stringify(rest));
  return getAutoBackupConfig();
}

function passphrase(): string | null {
  const raw = getGlobalSetting(SECRET);
  if (!raw) return null;
  const d = JSON.parse(raw) as Record<"e" | "i" | "t", string>;
  return decrypt({ encrypted: Buffer.from(d.e, "base64"), iv: Buffer.from(d.i, "base64"), authTag: Buffer.from(d.t, "base64") });
}

export function updateAutoBackupConfig(patch: { enabled?: boolean; frequency?: string; dir?: string; passphrase?: string }) {
  const c = getAutoBackupConfig();
  if (patch.passphrase !== undefined) {
    if (typeof patch.passphrase !== "string" || patch.passphrase.length < MIN_PASSPHRASE) throw new Error("weakPassphrase");
    const e = encrypt(patch.passphrase);
    setGlobalSetting(SECRET, JSON.stringify({ e: e.encrypted.toString("base64"), i: e.iv.toString("base64"), t: e.authTag.toString("base64") }));
  }
  if (patch.dir !== undefined) c.dir = validateDir(patch.dir);
  if (patch.frequency !== undefined) c.frequency = patch.frequency === "weekly" ? "weekly" : "daily";
  if (patch.enabled !== undefined) {
    if (patch.enabled === true && !getGlobalSetting(SECRET)) throw new Error("noPassphrase");
    c.enabled = patch.enabled === true;
  }
  return save(c);
}

/** Writes one encrypted backup now and keeps the newest few. Locked app → records "locked" instead of failing. */
export function runAutoBackup(): AutoBackupConfig {
  const c = getAutoBackupConfig();
  if (isKeyLocked()) return save({ ...c, status: "locked", error: null });
  try {
    const secret = passphrase();
    if (!secret) throw new Error("noPassphrase");
    const root = validateDir(c.dir);
    fs.mkdirSync(root, { recursive: true });
    const { bytes, fileName } = createBackup(secret);
    const file = path.join(root, fileName);
    if (path.dirname(file) !== root) throw new Error("outside"); // never write outside the chosen folder
    // Write then rename, so a sync client never uploads a half-written file.
    fs.writeFileSync(`${file}.tmp`, bytes);
    fs.renameSync(`${file}.tmp`, file);
    for (const old of backupsToPrune(fs.readdirSync(root))) fs.unlinkSync(path.join(root, old));
    return save({ ...c, lastAt: new Date().toISOString(), lastFile: file, status: "ok", error: null });
  } catch (e) {
    return save({ ...c, status: "error", error: e instanceof Error ? e.message.slice(0, 200) : "failed" });
  }
}

declare global {
  var __autoBackupTimer: ReturnType<typeof setInterval> | undefined;
}

/** Hourly check beside the sync scheduler. */
export function initAutoBackupSchedule() {
  if (globalThis.__autoBackupTimer) clearInterval(globalThis.__autoBackupTimer);
  const tick = () => {
    try {
      const c = getAutoBackupConfig();
      if (c.enabled && backupDue(c.status === "ok" ? c.lastAt : null, c.frequency)) runAutoBackup();
    } catch (e) {
      console.error("[auto-backup] tick failed:", e instanceof Error ? e.message : e);
    }
  };
  globalThis.__autoBackupTimer = setInterval(tick, 3_600_000);
  globalThis.__autoBackupTimer.unref?.();
  // A minute after start, so it never competes with migrations or the first page load.
  setTimeout(tick, 60_000).unref?.();
}
