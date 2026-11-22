import "server-only";

import { getDb } from "@/server/db";
import { reportAssetKey, reportAssetName, reportAssetType, reportDetails, type PensionReport } from "@/lib/pension-report";

export interface PensionImportResult {
  /** Products in the report. */
  products: number;
  created: number;
  updated: number;
  /** Insurance policies in the report, whether new or refreshed. */
  policies: number;
  policiesCreated: number;
  reportId: number;
}

export interface PensionReportRecord {
  id: number;
  asOf: string;
  member: string;
  source: string;
  fileName: string | null;
  issuedAt: string | null;
  totalSavings: number;
  products: number;
  importedAt: string;
}

/**
 * Imports an extracted pension report: products become assets with a value snapshot on the report
 * date, the insurance in it becomes policies, and the report header is kept in pension_reports.
 * Running it again updates the same rows (assets are matched by the marker in their note), never
 * duplicates them. What the user changed themselves — the asset's name, a policy's match text,
 * notes, agent or paying account — is left alone.
 */
export function importPensionReport(workspaceId: number, report: PensionReport): PensionImportResult {
  const db = getDb();
  let created = 0;
  let updated = 0;
  let policiesCreated = 0;

  const reportId = db.transaction(() => {
    const findAsset = db.prepare(`SELECT id FROM assets WHERE workspace_id = ? AND note = ?`);
    const insertAsset = db.prepare(
      `INSERT INTO assets (workspace_id, name, type, currency, manual_value, liquid, is_liability, note,
         fee_deposit, fee_balance, monthly_deposit, details)
       VALUES (?, ?, ?, 'ILS', ?, 0, 0, ?, ?, ?, ?, ?)`
    );
    const updateAsset = db.prepare(
      `UPDATE assets SET manual_value = ?, is_liability = 0, fee_deposit = ?, fee_balance = ?, monthly_deposit = ?, details = ?
       WHERE workspace_id = ? AND id = ?`
    );
    const snapshot = db.prepare(
      `INSERT INTO asset_snapshots (asset_id, date, value_ils) VALUES (?, ?, ?)
       ON CONFLICT(asset_id, date) DO UPDATE SET value_ils = excluded.value_ils`
    );

    for (const p of report.products) {
      const key = reportAssetKey(p);
      const details = JSON.stringify(reportDetails(p, report.asOf));
      const existing = findAsset.get(workspaceId, key) as { id: number } | undefined;
      let id: number;
      if (existing) {
        updateAsset.run(p.balance, p.feeDeposit, p.feeBalance, p.regularDeposit, details, workspaceId, existing.id);
        id = existing.id;
        updated++;
      } else {
        id = Number(
          insertAsset.run(workspaceId, reportAssetName(p), reportAssetType(p), p.balance, key, p.feeDeposit, p.feeBalance, p.regularDeposit, details)
            .lastInsertRowid
        );
        created++;
      }
      snapshot.run(id, report.asOf, p.balance);
    }

    const findPolicy = db.prepare(
      `SELECT id, notes, match_pattern AS matchPattern, agent_name AS agentName, agent_phone AS agentPhone, coverage
       FROM insurance_policies
       WHERE workspace_id = ? AND name = ? AND COALESCE(provider, '') = ? AND COALESCE(policy_number, '') = ?`
    );
    const insertPolicy = db.prepare(
      `INSERT INTO insurance_policies (workspace_id, name, kind, provider, monthly_premium, policy_number, start_date,
         match_pattern, coverage, notes, agent_name, agent_phone, insured, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const updatePolicy = db.prepare(
      `UPDATE insurance_policies SET
         kind = ?, monthly_premium = ?,
         start_date = COALESCE(?, start_date),
         coverage = COALESCE(?, coverage),
         notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes END,
         match_pattern = CASE WHEN match_pattern IS NULL OR match_pattern = '' THEN ? ELSE match_pattern END,
         agent_name = CASE WHEN agent_name IS NULL OR agent_name = '' THEN ? ELSE agent_name END,
         agent_phone = CASE WHEN agent_phone IS NULL OR agent_phone = '' THEN ? ELSE agent_phone END,
         updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    );
    const agent = report.agent?.name ?? null;
    const phone = report.agent?.phone ?? null;

    for (const ins of report.insurance) {
      const existing = findPolicy.get(workspaceId, ins.name, ins.provider, ins.policyNumber) as
        | { id: number; notes: string | null; matchPattern: string | null; agentName: string | null; agentPhone: string | null; coverage: number | null }
        | undefined;
      if (existing) {
        updatePolicy.run(ins.kind, ins.premium, ins.startDate, existing.coverage != null ? null : ins.coverage, ins.notes, ins.matchPattern,
          agent, phone, workspaceId, existing.id);
      } else {
        insertPolicy.run(workspaceId, ins.name, ins.kind, ins.provider, ins.premium, ins.policyNumber, ins.startDate,
          ins.matchPattern, ins.coverage, ins.notes, agent, phone, report.member || null);
        policiesCreated++;
      }
    }

    const saved = db
      .prepare(
        `INSERT INTO pension_reports (workspace_id, as_of, member, source, file_name, issued_at, total_savings, products, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, as_of, member, source) DO UPDATE SET
           file_name = excluded.file_name, issued_at = excluded.issued_at, total_savings = excluded.total_savings,
           products = excluded.products, summary = excluded.summary, imported_at = datetime('now')
         RETURNING id`
      )
      .get(
        workspaceId,
        report.asOf,
        report.member,
        report.source,
        report.file,
        report.issuedAt,
        report.totalSavings,
        report.products.length,
        JSON.stringify({ ...report.summary, agent: report.agent })
      ) as { id: number };
    return saved.id;
  })();

  return {
    products: report.products.length,
    created,
    updated,
    policies: report.insurance.length,
    policiesCreated,
    reportId,
  };
}

/** The last imports, newest first, for the settings page. */
export function listPensionReports(workspaceId: number, limit = 6): PensionReportRecord[] {
  return getDb()
    .prepare(
      `SELECT id, as_of AS asOf, member, source, file_name AS fileName, issued_at AS issuedAt,
         total_savings AS totalSavings, products, imported_at AS importedAt
       FROM pension_reports WHERE workspace_id = ? ORDER BY as_of DESC, id DESC LIMIT ?`
    )
    .all(workspaceId, Math.min(Math.max(limit, 1), 50)) as PensionReportRecord[];
}
