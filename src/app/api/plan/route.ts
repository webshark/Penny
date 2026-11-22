import { NextResponse } from "next/server";
import { GOAL_COLORS, goalReachMonth, keepHomeStyle, parsePlan, type FinancialPlan } from "@/lib/plan";
import { deleteRow, getPlan, listGoals, listPolicies, savePlan, upsertGoal, upsertPolicy } from "@/server/db/queries/plan";
import { deleteManualNetWorth, saveManualNetWorth } from "@/server/db/queries/assets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { POLICY_KINDS, type PlanPayload } from "@/lib/types";
import { profileFromRequest } from "@/server/db/queries/profiles";
import { getDb } from "@/server/db";
import { parseTrip, tripTotal } from "@/lib/trip";

// Pure view prefs: each profile keeps its own; the household plan's values are the default until it picks.
const VIEW = ["simpleMode", "razeMode", "wheelPaging", "homeStyle"] as const;
type View = Pick<FinancialPlan, (typeof VIEW)[number]>;
const viewOf = (p: FinancialPlan): View => ({ simpleMode: p.simpleMode, razeMode: p.razeMode, wheelPaging: p.wheelPaging, homeStyle: p.homeStyle });
function profileView(request: Request, ws: number): { key: string; view: Partial<View> } | null {
  const p = profileFromRequest(request, ws);
  if (!p) return null;
  const row = getDb().prepare("SELECT value FROM synced_preferences WHERE workspace_id = ? AND profile = ? AND key = 'plan-view'").get(ws, `p${p.id}`) as { value: string } | undefined;
  return { key: `p${p.id}`, view: row ? JSON.parse(row.value) : {} };
}
/** The household plan as this profile sees it. */
function planFor(request: Request, ws: number): FinancialPlan {
  const plan = getPlan(ws), own = profileView(request, ws);
  return own ? { ...plan, ...viewOf(parsePlan({ ...plan, ...own.view })) } : plan;
}

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const amount = (v: unknown) => {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) && n >= 0 && n < 1e10 ? n : null;
};

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const payload: PlanPayload = { plan: planFor(request, ws), goals: listGoals(ws), policies: listPolicies(ws) };
  return NextResponse.json(payload);
}

/** Body: { plan } — replaces the plan settings. */
export async function PUT(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  if (!body?.plan) return bad("plan is required");
  const plan = parsePlan(body.plan);
  const stored = getPlan(ws), own = profileView(request, ws);
  plan.homeStyle = keepHomeStyle(body.plan, planFor(request, ws).homeStyle);
  if (!own) { savePlan(ws, plan); return NextResponse.json(plan); }
  // A profile's view prefs go to its own row; the household's stay as they were.
  getDb().prepare("INSERT INTO synced_preferences (workspace_id, profile, key, value) VALUES (?, ?, 'plan-view', ?) ON CONFLICT(workspace_id, profile, key) DO UPDATE SET value = excluded.value, revision = revision + 1, updated_at = datetime('now')").run(ws, own.key, JSON.stringify(viewOf(plan)));
  savePlan(ws, { ...plan, ...viewOf(stored) });
  return NextResponse.json(plan);
}

/** Body: { kind: "goal" | "policy" | "netWorth", item } — creates, or updates when item.id is set. */
export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  const item = (body?.item ?? {}) as Record<string, unknown>;
  const id = item.id == null ? undefined : Number(item.id);
  if (id !== undefined && !Number.isInteger(id)) return bad("invalid id");

  if (body?.kind === "goal") {
    const name = text(item.name, 60);
    // A vacation plan: its lines' total is the target and its start month the date.
    const trip = item.trip == null ? null : parseTrip(item.trip);
    if (item.trip != null && !trip) return bad("trip needs a start and an end date (YYYY-MM-DD)");
    const targetAmount = trip ? tripTotal(trip) || null : amount(item.targetAmount);
    const savedAmount = amount(item.savedAmount) ?? 0;
    // Custom goals: a date is optional when there is a monthly contribution; then the date is when that reaches the target.
    const monthly = item.monthly == null || item.monthly === "" ? null : amount(item.monthly);
    if (monthly == null && item.monthly != null && item.monthly !== "") return bad("monthly must be a non-negative amount");
    const icon = typeof item.icon === "string" && item.icon.trim() ? [...item.icon.trim()].slice(0, 4).join("") : null;
    const color = GOAL_COLORS.find((c) => c === item.color) ?? null;
    if (item.color != null && !color) return bad("unknown goal color");
    const given = item.dated !== false && typeof item.targetDate === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.targetDate) ? item.targetDate : null;
    // shortcut: an undated goal's month is fixed when saved; it moves only on the next edit.
    const targetDate = trip ? trip.start.slice(0, 7) : given ?? (targetAmount ? goalReachMonth(targetAmount, savedAmount, monthly, new Date()) : null);
    if (!name || !targetAmount || !targetDate) return bad("goal needs a name, an amount, and a month (YYYY-MM) or a monthly amount");
    const extra = trip || (!icon && !color && !monthly && given) ? null : { icon, color, monthly, dated: !!given };
    const ok = upsertGoal(ws, { id, name, targetAmount, targetDate, savedAmount, trip, extra });
    return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (body?.kind === "policy") {
    const name = text(item.name, 60);
    const kind = POLICY_KINDS.find((k) => k === item.kind);
    const monthlyPremium = amount(item.monthlyPremium);
    if (!name || !kind || monthlyPremium == null) return bad("policy needs a name, a kind and a monthly premium");
    const rm = item.renewalMonth;
    if (rm != null && rm !== "" && !(typeof rm === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(rm))) return bad("renewal month must be YYYY-MM");
    const renewalMonth = typeof rm === "string" && rm ? rm : null;
    const ok = upsertPolicy(ws, { id, name, kind, provider: text(item.provider, 60), monthlyPremium, renewalMonth, insured: text(item.insured, 40) });
    return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (body?.kind === "netWorth") {
    const date = typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
    const netWorth = Number(item.netWorth);
    if (!date || !Number.isFinite(netWorth) || Math.abs(netWorth) >= 1e10) return bad("net worth needs a date and an amount");
    saveManualNetWorth(ws, date, netWorth);
    return NextResponse.json({ success: true });
  }
  return bad("unknown kind");
}

/** ?kind=goal|policy&id=… or ?kind=netWorth&date=YYYY-MM-DD */
export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const q = new URL(request.url).searchParams;
  const kind = q.get("kind");
  let ok = false;
  if (kind === "goal" || kind === "policy") {
    const id = Number(q.get("id"));
    if (!Number.isInteger(id)) return bad("invalid id");
    ok = deleteRow(kind === "goal" ? "goals" : "insurance_policies", ws, id);
  } else if (kind === "netWorth") {
    ok = deleteManualNetWorth(ws, q.get("date") ?? "");
  } else return bad("unknown kind");
  return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
