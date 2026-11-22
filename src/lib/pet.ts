/** Pocket Pal: a small household pet whose mood comes from the finances. Pure. */

import { hexToOklch } from "@/lib/category-colors";
import { PET_SKIN_LOOKS, SKIN_VARIANTS } from "@/lib/pet-skins";

export { PET_SKIN_LOOKS };

export type PetMood = "happy" | "ok" | "hungry" | "caring";
export type PetStat = "food" | "energy" | "joy" | "health" | "tidy";

export interface PetInputs {
  /** Spent this month vs budget; null budget = none set. */
  spent: number | null;
  budget: number | null;
  /** 0–1 share of the month gone. */
  elapsed: number;
  emergencyMonths: number | null;
  targetMonths: number;
  savingsRate: number | null;
  /** Costly debt or a dip below zero before payday. */
  overdraft: boolean;
  /** How far below zero the bank is now (0 or null when not); the first thing worth paying off. */
  overdraftAmount?: number | null;
  uncategorized: number;
}

export interface PetLine { stat: PetStat; ok: boolean; reason: string; vars?: Record<string, number> }

/** Each stat is simply fine or needs care, with the reason; the order is also the "what to do next" priority. */
export function petLines(i: PetInputs): PetLine[] {
  const pace = i.budget && i.budget > 0 && i.spent != null ? i.spent / (i.budget * Math.max(i.elapsed, 0.05)) : null;
  const months = Math.round((i.emergencyMonths ?? 0) * 10) / 10;
  const rate = i.savingsRate == null ? null : Math.round(i.savingsRate * 100);
  return [
    i.overdraftAmount && i.overdraftAmount > 0
      ? { stat: "health", ok: false, reason: "overdraftAmount", vars: { amount: Math.round(i.overdraftAmount) } }
      : { stat: "health", ok: !i.overdraft, reason: i.overdraft ? "overdraft" : "noOverdraft" },
    pace == null ? { stat: "food", ok: true, reason: "noBudget" } : { stat: "food", ok: pace <= 1.1, reason: pace <= 1.1 ? "onPace" : "overPace", vars: { pct: Math.round((pace - 1) * 100) } },
    { stat: "tidy", ok: i.uncategorized === 0, reason: i.uncategorized ? "messy" : "tidy", vars: { n: i.uncategorized } },
    { stat: "energy", ok: months >= i.targetMonths / 2, reason: "runway", vars: { months, target: i.targetMonths } },
    rate == null ? { stat: "joy", ok: true, reason: "noSaving" } : { stat: "joy", ok: rate >= 10, reason: "saving", vars: { rate } },
  ];
}

/** Never sleepy: with an overdraft or several issues it looks in with care. */
export function petMood(lines: PetLine[]): PetMood {
  const bad = lines.filter((l) => !l.ok);
  if (bad.length >= 3 || bad.some((l) => l.stat === "health")) return "caring";
  if (bad.some((l) => l.stat === "food")) return "hungry";
  return bad.length ? "ok" : "happy";
}

/** Snooze/dismiss key: the stat and why, so a new kind of issue on the same stat shows again. */
export const petKey = (l: PetLine) => `${l.stat}:${l.reason}`;

/** What needs care now, most important first, minus anything snoozed past `today` (YYYY-MM-DD). */
export const petTodo = (lines: PetLine[], snooze: Record<string, string> = {}, today = petToday()) =>
  lines.filter((l) => !l.ok && !((snooze[petKey(l)] ?? "") > today));

/** The "+n" badge on the face (none at 0): only items not snoozed or dismissed. */
export const petNeedsCare = (lines: PetLine[], snooze?: Record<string, string>, today?: string) => petTodo(lines, snooze, today).length;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const petToday = (now = new Date()) => ymd(now);
/** Hidden until (exclusive): "day" = tomorrow, "week" = in 7 days, "dismiss" = the 1st of next month (it comes back if still true). */
export function petSnoozeUntil(kind: "day" | "week" | "dismiss", now = new Date()): string {
  if (kind === "dismiss") return ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (kind === "day" ? 1 : 7)));
}
/** Adds one snooze and drops expired ones, so the stored map stays small. */
export function petSnooze(snooze: Record<string, string>, key: string, until: string, today: string): Record<string, string> {
  return Object.fromEntries([...Object.entries(snooze).filter(([, u]) => u > today), [key, until]]);
}

export const PET_SIZES = { s: 120, m: 180, l: 250 } as const;
export type PetSize = keyof typeof PET_SIZES;
/** Every look BoopFace ships, one per series (full build, loaded only when one is picked). */
export const PET_SKINS: readonly string[] = PET_SKIN_LOOKS.map((l) => l.id);
/** One swatch per named colour (the order is the row in the picker); anything else goes through the colour input. */
export const PET_COLORS = [
  "#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff",
  "#ffd60a", "#5e5ce6", "#00c7be", "#a2845e", "#ff6482", "#8e8e93",
] as const;

/** The variant of a look closest to the picked colour, so two people with the same look but different colours get different Pips. */
export function skinFor(skin: string, color: string): string {
  const variants = SKIN_VARIANTS[skin];
  if (!variants || !/^#[0-9a-f]{6}$/i.test(color)) return skin;
  const lab = (hex: string) => { const o = hexToOklch(hex); const r = (o.h * Math.PI) / 180; return [o.l, o.c * Math.cos(r), o.c * Math.sin(r)]; };
  const want = lab(color);
  let best = skin, bestD = Infinity;
  for (const [id, hex] of Object.entries(variants)) {
    const d = lab(hex).reduce((sum, v, i) => sum + (i ? 2 : 1) * (v - want[i]) ** 2, 0); // hue and chroma weigh more than lightness
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

/** color "" = the theme accent; skin "" = flat color; snooze = issue key → hidden until (YYYY-MM-DD). */
export interface PetSettings { enabled: boolean; name: string; color: string; size: PetSize; skin: string; snooze: Record<string, string>; /** Head shape, 0 (square) to 100 (round); null keeps the face's own. */ roundness: number | null }

/** On unless the household turned it off. */
export function parsePet(raw: unknown): PetSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled !== false,
    name: typeof r.name === "string" ? r.name.trim().slice(0, 24) : "",
    color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : "",
    size: typeof r.size === "string" && Object.hasOwn(PET_SIZES, r.size) ? (r.size as PetSize) : "m",
    skin: (PET_SKINS as readonly unknown[]).includes(r.skin) ? String(r.skin) : "",
    roundness: typeof r.roundness === "number" && Number.isFinite(r.roundness) ? Math.min(100, Math.max(0, Math.round(r.roundness))) : null,
    snooze: Object.fromEntries(Object.entries(r.snooze && typeof r.snooze === "object" ? r.snooze : {})
      .filter(([k, v]) => /^[a-z]+:[a-zA-Z]+$/.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)).slice(0, 20)),
  };
}

/** BoopFace action for each mood (the face's own animation set). */
export const PET_ACTION = { happy: "success", ok: "idle", hungry: "wary", caring: "inspect" } as const satisfies Record<PetMood, string>;
