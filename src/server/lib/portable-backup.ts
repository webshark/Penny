import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { closeDb, getDb } from "@/server/db";
import { backupBeforeMigration, backupDir } from "@/server/db/backup";
import { dataDir, dbPath } from "@/server/lib/data-dir";
import { getKey, keyPath, setKeyInMemory } from "@/server/lib/encryption";
import { isLockEnabled } from "@/server/lib/app-lock";

/**
 * One portable, passphrase-encrypted file holding the database and the key that decrypts the
 * credentials in it. Losing the key would leave the credentials unreadable, so both travel together.
 */
const MAGIC = Buffer.from("PENNYBK1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SQLITE_HEADER = Buffer.from("SQLite format 3\u0000");
export const MIN_PASSPHRASE = 8;

export interface BackupPayload {
  format: 1;
  createdAt: string;
  appVersion: string;
  database: string;
  encryptionKey: string | null;
  /** Insurance documents and receipts, by path under the data folder (base64). Older backups have none. */
  files?: Record<string, string>;
}

/** The folders under the data folder whose files belong to rows in the database. */
export const BACKUP_FILE_DIRS = ["policies", "receipts"] as const;

/** Every file in those folders, keyed by its path with forward slashes. */
export function collectDataFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) out[child] = fs.readFileSync(path.join(root, child)).toString("base64");
    }
  };
  for (const dir of BACKUP_FILE_DIRS) walk(dir);
  return out;
}

/** Where a backed-up file goes back, or null for any path outside those folders (a crafted backup must not write elsewhere). */
export function restorePathFor(root: string, rel: string): string | null {
  const parts = rel.split("/");
  if (!(BACKUP_FILE_DIRS as readonly string[]).includes(parts[0]) || parts.some((p) => p === "" || p === "." || p === "..")) return null;
  const base = path.resolve(root, parts[0]);
  const target = path.resolve(root, ...parts);
  return target.startsWith(base + path.sep) ? target : null;
}

export interface BackupCounts {
  transactions: number;
  from: string | null;
  to: string | null;
}

const derive = (passphrase: string, salt: Buffer) => crypto.scryptSync(passphrase, salt, 32, SCRYPT);

export function encryptBackup(plain: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

/** Throws "badFile" for anything that is not a Penny backup, "badPassphrase" when the tag fails. */
export function decryptBackup(file: Buffer, passphrase: string): Buffer {
  const header = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;
  if (file.length <= header || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("badFile");
  const salt = file.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = file.subarray(MAGIC.length + SALT_BYTES, MAGIC.length + SALT_BYTES + IV_BYTES);
  const tag = file.subarray(MAGIC.length + SALT_BYTES + IV_BYTES, header);
  const body = file.subarray(header);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", derive(passphrase, salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new Error("badPassphrase");
  }
}

/** Reads a backup file back into its payload, refusing anything that is not one. */
export function readBackup(file: Buffer, passphrase: string): BackupPayload {
  const plain = decryptBackup(file, passphrase);
  let payload: BackupPayload;
  try {
    payload = JSON.parse(plain.toString("utf8")) as BackupPayload;
  } catch {
    throw new Error("badFile");
  }
  if (payload?.format !== 1 || typeof payload.database !== "string" || !isSqlite(Buffer.from(payload.database, "base64"))) {
    throw new Error("badFile");
  }
  return payload;
}

export function isSqlite(bytes: Buffer): boolean {
  return bytes.length > SQLITE_HEADER.length && bytes.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER);
}

function countsOf(db: Database.Database): BackupCounts {
  try {
    const row = db.prepare("SELECT COUNT(*) AS n, MIN(substr(date, 1, 10)) AS from, MAX(substr(date, 1, 10)) AS to FROM transactions").get() as {
      n: number;
      from: string | null;
      to: string | null;
    };
    return { transactions: row.n, from: row.from, to: row.to };
  } catch {
    return { transactions: 0, from: null, to: null };
  }
}

export function backupFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `penny-backup-${stamp}.pennybak`;
}

/** Checkpoints WAL, then encrypts the database file and the key into one buffer. */
export function createBackup(passphrase: string): { bytes: Buffer; fileName: string; counts: BackupCounts } {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error("weakPassphrase");
  const db = getDb();
  db.pragma("wal_checkpoint(TRUNCATE)");
  const file = dbPath();
  if (!fs.existsSync(file)) throw new Error("noDatabase");
  const payload: BackupPayload = {
    format: 1,
    createdAt: new Date().toISOString(),
    appVersion: process.env.npm_package_version ?? "1.0.0",
    database: fs.readFileSync(file).toString("base64"),
    // The raw 32-byte key, also when the app lock keeps it only in memory: without it saved logins are unreadable.
    encryptionKey: currentKey()?.toString("base64") ?? null,
    files: collectDataFiles(dataDir()),
  };
  return {
    bytes: encryptBackup(Buffer.from(JSON.stringify(payload), "utf8"), passphrase),
    fileName: backupFileName(),
    counts: countsOf(db),
  };
}

export interface BackupFileInfo {
  name: string;
  size: number;
  at: string;
}

/** The encrypted backups already on disk, newest first. */
export function listBackups(): BackupFileInfo[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".pennybak"))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Opens the restored bytes in a temp file to be sure they are a Penny database before touching ours. */
function opensAsPennyDatabase(bytes: Buffer): boolean {
  if (!isSqlite(bytes)) return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-restore-"));
  const file = path.join(dir, "check.db");
  try {
    fs.writeFileSync(file, bytes);
    const probe = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
      return tables.some((t) => t.name === "transactions") && tables.some((t) => t.name === "workspaces");
    } finally {
      probe.close();
    }
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function currentKey(): Buffer | null {
  try {
    return getKey();
  } catch {
    return null;
  }
}

/** The key from a backup: raw 32 bytes, or the hex text older backups copied straight from the key file. */
export function backupKey(b64: string | null | undefined): Buffer | null {
  if (!b64) return null;
  const raw = Buffer.from(b64, "base64");
  if (raw.length === 32) return raw;
  const text = raw.toString("utf8").trim();
  return /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, "hex") : null;
}

export interface RestoreResult {
  counts: BackupCounts;
  preRestoreBackup: string | null;
  createdAt: string;
}

/**
 * Replaces the live database with a backup, once the passphrase is checked. The current database is
 * copied to data/backups first, so a wrong file is one more restore away from being undone.
 */
export function applyBackup(file: Buffer, passphrase: string): RestoreResult {
  const payload = readBackup(file, passphrase);
  const database = Buffer.from(payload.database, "base64");
  if (!opensAsPennyDatabase(database)) throw new Error("badFile");

  const key = backupKey(payload.encryptionKey);
  // With the lock on, the key lives wrapped by the passphrase, which a restore doesn't have. A different key
  // can't be stored without breaking the lock, so ask for the lock to be turned off first (before anything changes).
  if (key && isLockEnabled() && !key.equals(currentKey() ?? Buffer.alloc(0))) throw new Error("lockOn");

  const db = getDb();
  const preRestoreBackup = backupBeforeMigration(db, "restore");
  const target = dbPath();
  closeDb();
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${target}${suffix}`, { force: true });
  fs.writeFileSync(target, database);
  // Credentials in the backup were encrypted with this key, so the restored database needs it, stored the way
  // getOrCreateKey reads it (hex text) and loaded into memory now.
  if (key && !isLockEnabled()) {
    fs.writeFileSync(keyPath(), key.toString("hex"), { mode: 0o600 });
    fs.chmodSync(keyPath(), 0o600);
    setKeyInMemory(key);
  }
  // Documents and receipts come back beside the rows that point to them. Files already here stay.
  for (const [rel, data] of Object.entries(payload.files ?? {})) {
    const target = typeof data === "string" ? restorePathFor(dataDir(), rel) : null;
    if (!target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data, "base64"));
  }
  const fresh = getDb();
  const check = fresh.pragma("quick_check") as { quick_check: string }[];
  if (!check.every((row) => row.quick_check === "ok")) throw new Error("corruptRestore");
  return { counts: countsOf(fresh), preRestoreBackup, createdAt: payload.createdAt };
}

/** Where the app keeps its data, for the settings card. */
export const dataDirectory = dataDir;
