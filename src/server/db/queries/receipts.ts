import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../index";
import { dataDir } from "../../lib/data-dir";
import { FILE_MIME, MAX_INSURANCE_FILE, safeFileName } from "./insurance";

export interface Receipt { id: number; transactionId: number; fileName: string; originalName: string; mime: string; size: number; uploadedAt: string }

export const RECEIPT_MIME = Object.keys(FILE_MIME);
export const MAX_RECEIPT_FILE = MAX_INSURANCE_FILE;

const COLUMNS = "id, transaction_id as transactionId, file_name as fileName, original_name as originalName, mime, size, uploaded_at as uploadedAt";
const folderOf = (workspaceId: number, transactionId: number) => path.join(dataDir(), "receipts", String(workspaceId), String(transactionId));

export function listReceipts(workspaceId: number, transactionId: number): Receipt[] {
  return getDb().prepare(`SELECT ${COLUMNS} FROM transaction_receipts WHERE workspace_id = ? AND transaction_id = ? ORDER BY id`).all(workspaceId, transactionId) as Receipt[];
}

export function addReceipt(workspaceId: number, transactionId: number, file: { name: string; mime: string; data: Buffer }): Receipt | null {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM transactions WHERE workspace_id = ? AND id = ?").get(workspaceId, transactionId)) return null;
  const ext = FILE_MIME[file.mime];
  if (!ext || !file.data.length || file.data.length > MAX_RECEIPT_FILE) return null;
  const id = Number(db.prepare("INSERT INTO transaction_receipts (workspace_id, transaction_id, file_name, original_name, mime, size) VALUES (?, ?, '', ?, ?, ?)")
    .run(workspaceId, transactionId, file.name.slice(0, 200), file.mime, file.data.length).lastInsertRowid);
  const fileName = `${id}-${safeFileName(file.name)}.${ext}`;
  const folder = folderOf(workspaceId, transactionId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, fileName), file.data);
  db.prepare("UPDATE transaction_receipts SET file_name = ? WHERE id = ?").run(fileName, id);
  return getReceipt(workspaceId, id);
}

export function getReceipt(workspaceId: number, id: number): Receipt | null {
  return (getDb().prepare(`SELECT ${COLUMNS} FROM transaction_receipts WHERE workspace_id = ? AND id = ?`).get(workspaceId, id) as Receipt | undefined) ?? null;
}

/** The file on disk, or null. The path is built from stored values only and must stay inside the folder. */
export function receiptFile(workspaceId: number, r: Receipt): string | null {
  const folder = path.resolve(folderOf(workspaceId, r.transactionId));
  const file = path.resolve(folder, r.fileName);
  if (!file.startsWith(folder + path.sep)) return null;
  return fs.existsSync(file) ? file : null;
}

export function deleteReceipt(workspaceId: number, id: number): boolean {
  const r = getReceipt(workspaceId, id);
  if (!r) return false;
  const file = receiptFile(workspaceId, r);
  if (file) fs.rmSync(file, { force: true });
  return getDb().prepare("DELETE FROM transaction_receipts WHERE workspace_id = ? AND id = ?").run(workspaceId, id).changes > 0;
}
