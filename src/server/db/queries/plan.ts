import "server-only";

import { getDb } from "../index";
import { getWorkspaceSetting, setWorkspaceSetting } from "./settings";
import { defaultHomeStyle, HOME_STYLES, parsePlan, type FinancialPlan } from "@/lib/plan";
import type { Goal, InsurancePolicy } from "@/lib/types";
import { parseTrip } from "@/lib/trip";

const PLAN_KEY = "financial_plan";

export function getPlan(workspaceId: number): FinancialPlan {
  const raw = getWorkspaceSetting(workspaceId, PLAN_KEY);
  let stored: unknown = {};
  let corrupt = false;
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    corrupt = true;
  }
  const plan = parsePlan(stored);
  const has = (HOME_STYLES as readonly unknown[]).includes((stored as { homeStyle?: unknown } | null)?.homeStyle);
  if (has || corrupt) return plan; // never overwrite an unparseable blob
  // Write-once: the first read decides, so a user who later onboards or adds data keeps the style they were given.
  const hasTx = !!getDb().prepare("SELECT 1 FROM transactions WHERE workspace_id = ? LIMIT 1").get(workspaceId);
  plan.homeStyle = defaultHomeStyle(plan.profile.onboarded, hasTx);
  savePlan(workspaceId, plan);
  return plan;
}

export function savePlan(workspaceId: number, plan: FinancialPlan) {
  setWorkspaceSetting(workspaceId, PLAN_KEY, JSON.stringify(plan));
}

export function listGoals(workspaceId: number): Goal[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, kind, details, target_amount as targetAmount, target_date as targetDate, saved_amount as openingSavedAmount, saved_amount + COALESCE((SELECT SUM(l.contribution) FROM goal_links l JOIN transactions t ON t.id=l.transaction_id WHERE l.goal_id=goals.id AND t.is_excluded=0 AND t.kind='transfer' AND t.status='completed'),0) as savedAmount
       FROM goals WHERE workspace_id = ? ORDER BY target_date`
    )
    .all(workspaceId) as (Goal & { details: string | null })[];
  return rows.map(({ details, ...g }) => {
    if (g.kind !== "vacation") {
      let extra = {};
      try { extra = JSON.parse(details ?? "{}") ?? {}; } catch { /* bad JSON: no extras */ }
      return { ...extra, ...g };
    }
    let trip = null;
    try { trip = parseTrip(JSON.parse(details ?? "null")); } catch { /* bad JSON: plain goal */ }
    return { ...g, trip, actual: trip ? tripActual(workspaceId, trip.start, trip.end) : 0 };
  });
}

/** Spending between two dates in the Travel category and its subcategories (refunds reduce it). */
export function tripActual(workspaceId: number, start: string, end: string): number {
  const row = getDb().prepare(
    `SELECT COALESCE(-SUM(t.personal_amount), 0) AS total FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.workspace_id = ? AND t.is_excluded = 0 AND t.kind = 'expense' AND substr(t.date, 1, 10) BETWEEN ? AND ?
       AND (c.name = 'Travel' OR c.parent_id IN (SELECT id FROM categories WHERE workspace_id = ? AND name = 'Travel'))`
  ).get(workspaceId, start, end, workspaceId) as { total: number };
  return Math.max(0, row.total);
}

export function upsertGoal(workspaceId: number, g: Omit<Goal, "id"> & { id?: number; extra?: Pick<Goal, "icon" | "color" | "monthly" | "dated"> | null }) {
  const db = getDb();
  const kind = g.trip ? "vacation" : "general", details = g.trip ? JSON.stringify(g.trip) : g.extra ? JSON.stringify(g.extra) : null;
  if (g.id) {
    return db
      .prepare("UPDATE goals SET name = ?, target_amount = ?, target_date = ?, saved_amount = ?, kind = ?, details = ? WHERE workspace_id = ? AND id = ?")
      .run(g.name, g.targetAmount, g.targetDate, g.savedAmount, kind, details, workspaceId, g.id).changes > 0;
  }
  db.prepare("INSERT INTO goals (workspace_id, name, target_amount, target_date, saved_amount, kind, details) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(workspaceId, g.name, g.targetAmount, g.targetDate, g.savedAmount, kind, details);
  return true;
}

export function listPolicies(workspaceId: number): InsurancePolicy[] {
  return getDb()
    .prepare(
      `SELECT id, name, kind, provider, monthly_premium as monthlyPremium, renewal_month as renewalMonth, insured
       FROM insurance_policies WHERE workspace_id = ? ORDER BY renewal_month IS NULL, renewal_month, kind, name`
    )
    .all(workspaceId) as InsurancePolicy[];
}

export function upsertPolicy(workspaceId: number, p: Omit<InsurancePolicy, "id"> & { id?: number }) {
  const db = getDb();
  if (p.id) {
    return db
      .prepare("UPDATE insurance_policies SET name = ?, kind = ?, provider = ?, monthly_premium = ?, renewal_month = ?, insured = ? WHERE workspace_id = ? AND id = ?")
      .run(p.name, p.kind, p.provider, p.monthlyPremium, p.renewalMonth ?? null, p.insured ?? null, workspaceId, p.id).changes > 0;
  }
  db.prepare("INSERT INTO insurance_policies (workspace_id, name, kind, provider, monthly_premium, renewal_month, insured) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(workspaceId, p.name, p.kind, p.provider, p.monthlyPremium, p.renewalMonth ?? null, p.insured ?? null);
  return true;
}

/** Table names are fixed here, never from input. */
export function deleteRow(table: "goals" | "insurance_policies", workspaceId: number, id: number): boolean {
  return getDb().prepare(`DELETE FROM ${table} WHERE workspace_id = ? AND id = ?`).run(workspaceId, id).changes > 0;
}
