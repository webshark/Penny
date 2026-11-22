import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../index";
import { dataDir } from "../../lib/data-dir";
import {
  insuranceTotals,
  policyMatchesCharge,
  renewalSoon,
  sortPolicies,
  summarizePayments,
  unlinkedCharges,
  type InsuranceCharge,
} from "@/lib/insurance";
import {
  INSURANCE_DOC_KINDS,
  type InsuranceDocument,
  type InsurancePayload,
  type InsurancePolicy,
  type InsurancePolicyView,
} from "@/lib/types";

export type InsurancePolicyInput = Omit<InsurancePolicy, "id" | "archived"> & { id?: number; archived?: boolean };

export const FILE_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const MAX_INSURANCE_FILE = 40 * 1024 * 1024;
export const INSURANCE_MIME = Object.keys(FILE_MIME);

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function policyOf(row: Row): InsurancePolicy {
  return {
    id: Number(row.id),
    name: String(row.name),
    kind: row.kind as InsurancePolicy["kind"],
    provider: str(row.provider),
    monthlyPremium: Number(row.monthly_premium) || 0,
    renewalMonth: str(row.renewal_month),
    insured: str(row.insured),
    policyNumber: str(row.policy_number),
    paymentAccount: str(row.payment_account),
    matchPattern: str(row.match_pattern),
    startDate: str(row.start_date),
    endDate: str(row.end_date),
    coverage: num(row.coverage),
    deductible: num(row.deductible),
    agentName: str(row.agent_name),
    agentPhone: str(row.agent_phone),
    notes: str(row.notes),
    archived: !!row.archived,
  };
}

function documentOf(row: Row): InsuranceDocument {
  return {
    id: Number(row.id),
    policyId: Number(row.policy_id),
    fileName: String(row.file_name),
    originalName: String(row.original_name),
    mime: String(row.mime),
    size: Number(row.size),
    kind: row.kind as InsuranceDocument["kind"],
    uploadedAt: String(row.uploaded_at),
  };
}

/** Premium-looking debits of the last year: by category, or by a policy's own match text. */
function charges(workspaceId: number, today: Date): InsuranceCharge[] {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365).toISOString().slice(0, 10);
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.description, substr(t.date, 1, 10) AS date, t.account_number AS account, -t.charged_amount AS amount
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE t.workspace_id = ? AND t.is_excluded = 0 AND t.kind = 'expense'
         AND substr(t.date, 1, 10) >= ? AND substr(t.date, 1, 10) <= ?
         AND (
           c.name LIKE '%ביטוח%' OR p.name LIKE '%ביטוח%'
           OR c.name LIKE '%insurance%' OR p.name LIKE '%insurance%'
           OR EXISTS (
             SELECT 1 FROM insurance_policies ip
             WHERE ip.workspace_id = t.workspace_id AND ip.archived = 0
               AND ip.match_pattern IS NOT NULL AND ip.match_pattern <> ''
               AND instr(lower(t.description), lower(ip.match_pattern)) > 0
           )
         )
       ORDER BY t.date`
    )
    .all(workspaceId, from, today.toISOString().slice(0, 10)) as InsuranceCharge[];
  return rows;
}

export function listInsurance(workspaceId: number, today = new Date()): InsurancePayload {
  const db = getDb();
  const policies = (db.prepare(`SELECT * FROM insurance_policies WHERE workspace_id = ? ORDER BY archived, name`).all(workspaceId) as Row[]).map(policyOf);
  const documents = (db.prepare(`SELECT * FROM insurance_documents WHERE workspace_id = ? ORDER BY uploaded_at DESC`).all(workspaceId) as Row[]).map(documentOf);
  const list = charges(workspaceId, today);

  const views: InsurancePolicyView[] = policies.map((p) => ({
    ...p,
    archived: !!p.archived,
    documents: documents.filter((d) => d.policyId === p.id),
    payments: summarizePayments(list.filter((c) => policyMatchesCharge(p, c))),
    renewalSoon: renewalSoon(p, today),
  }));
  const sorted = sortPolicies(views);

  const accounts = (
    db.prepare(`SELECT DISTINCT account_number AS account FROM transactions WHERE workspace_id = ? ORDER BY account_number`).all(workspaceId) as {
      account: string;
    }[]
  ).map((r) => r.account);

  return {
    policies: sorted,
    unlinked: unlinkedCharges(list, policies),
    totals: insuranceTotals(sorted),
    accounts,
  };
}

export function upsertInsurancePolicy(workspaceId: number, input: InsurancePolicyInput): number | null {
  const db = getDb();
  const values = {
    name: input.name,
    kind: input.kind,
    provider: input.provider ?? null,
    monthly_premium: input.monthlyPremium,
    renewal_month: input.renewalMonth ?? null,
    insured: input.insured ?? null,
    policy_number: input.policyNumber ?? null,
    payment_account: input.paymentAccount ?? null,
    match_pattern: input.matchPattern ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    coverage: input.coverage ?? null,
    deductible: input.deductible ?? null,
    agent_name: input.agentName ?? null,
    agent_phone: input.agentPhone ?? null,
    notes: input.notes ?? null,
    archived: input.archived ? 1 : 0,
  };
  if (input.id) {
    const columns = Object.keys(values) as (keyof typeof values)[];
    const changes = db
      .prepare(
        `UPDATE insurance_policies SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now')
         WHERE workspace_id = ? AND id = ?`
      )
      .run(...columns.map((c) => values[c]), workspaceId, input.id).changes;
    return changes ? input.id : null;
  }
  const columns = Object.keys(values) as (keyof typeof values)[];
  const res = db
    .prepare(`INSERT INTO insurance_policies (workspace_id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`)
    .run(workspaceId, ...columns.map((c) => values[c]));
  return Number(res.lastInsertRowid);
}

export function policyFolder(workspaceId: number, policyId: number): string {
  return path.join(dataDir(), "policies", String(workspaceId), String(policyId));
}

export function deleteInsurancePolicy(workspaceId: number, id: number): boolean {
  const db = getDb();
  const removed = db.prepare(`DELETE FROM insurance_policies WHERE workspace_id = ? AND id = ?`).run(workspaceId, id).changes > 0;
  if (removed) fs.rmSync(policyFolder(workspaceId, id), { recursive: true, force: true });
  return removed;
}

/** Keeps the name readable (Hebrew too) but safe as a file name. */
export function safeFileName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 80) || "document"
  );
}

export function addInsuranceDocument(
  workspaceId: number,
  policyId: number,
  file: { name: string; mime: string; data: Buffer }
): InsuranceDocument | null {
  const db = getDb();
  const policy = db.prepare(`SELECT 1 FROM insurance_policies WHERE workspace_id = ? AND id = ?`).get(workspaceId, policyId);
  if (!policy) return null;
  const ext = FILE_MIME[file.mime];
  if (!ext || !file.data.length || file.data.length > MAX_INSURANCE_FILE) return null;

  const res = db
    .prepare(`INSERT INTO insurance_documents (workspace_id, policy_id, file_name, original_name, mime, size) VALUES (?, ?, '', ?, ?, ?)`)
    .run(workspaceId, policyId, file.name.slice(0, 200), file.mime, file.data.length);
  const id = Number(res.lastInsertRowid);
  const fileName = `${id}-${safeFileName(file.name)}.${ext}`;
  const folder = policyFolder(workspaceId, policyId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, fileName), file.data);
  db.prepare(`UPDATE insurance_documents SET file_name = ? WHERE id = ?`).run(fileName, id);
  const row = db.prepare(`SELECT * FROM insurance_documents WHERE id = ?`).get(id) as Row;
  return documentOf(row);
}

export function getInsuranceDocument(workspaceId: number, docId: number): InsuranceDocument | null {
  const row = getDb().prepare(`SELECT * FROM insurance_documents WHERE workspace_id = ? AND id = ?`).get(workspaceId, docId) as Row | undefined;
  return row ? documentOf(row) : null;
}

/** The file on disk, or null if the row or file is gone. Path is built from stored values only. */
export function insuranceDocumentFile(workspaceId: number, doc: InsuranceDocument): string | null {
  const folder = policyFolder(workspaceId, doc.policyId);
  const file = path.resolve(folder, doc.fileName);
  if (!file.startsWith(path.resolve(folder) + path.sep)) return null;
  return fs.existsSync(file) ? file : null;
}

export function setInsuranceDocumentKind(workspaceId: number, docId: number, kind: (typeof INSURANCE_DOC_KINDS)[number]): boolean {
  return (
    getDb().prepare(`UPDATE insurance_documents SET kind = ? WHERE workspace_id = ? AND id = ?`).run(kind, workspaceId, docId).changes > 0
  );
}

export function deleteInsuranceDocument(workspaceId: number, docId: number): boolean {
  const doc = getInsuranceDocument(workspaceId, docId);
  if (!doc) return false;
  const file = insuranceDocumentFile(workspaceId, doc);
  if (file) fs.rmSync(file, { force: true });
  return getDb().prepare(`DELETE FROM insurance_documents WHERE workspace_id = ? AND id = ?`).run(workspaceId, docId).changes > 0;
}
