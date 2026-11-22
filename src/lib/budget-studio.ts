import type { CategoryWithData } from "./types";

export type StudioPreferences = {
  customColor: string | null;
  theme: "pearl" | "midnight" | "system";
  accent: "violet" | "ocean" | "jade" | "rose";
  chart: "bars" | "donut" | "table";
  metric: "remaining" | "spent";
  density: "comfortable" | "compact";
  layout: "balanced" | "stacked";
  showChart: boolean;
  showJourney: boolean;
  motion: boolean;
};

export const STUDIO_KEY = "shekel.budget-studio.v1";
export const DEFAULT_STUDIO: StudioPreferences = {
  customColor: null, theme: "pearl", accent: "violet", chart: "bars", metric: "remaining",
  density: "comfortable", layout: "balanced", showChart: true, showJourney: true, motion: true,
};

// Persisted data is untrusted, including values from earlier versions of the UI.
export function parseStudioPreferences(raw: string | null): StudioPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_STUDIO };
    const source = value as Record<string, unknown>;
    const result = { ...DEFAULT_STUDIO };
    const enums = {
      theme: ["pearl", "midnight", "system"],
      chart: ["bars", "donut", "table"], metric: ["remaining", "spent"],
      density: ["comfortable", "compact"], layout: ["balanced", "stacked"],
    } as const;
    for (const key of Object.keys(enums) as (keyof typeof enums)[]) {
      if ((enums[key] as readonly unknown[]).includes(source[key])) {
        Object.assign(result, { [key]: source[key] });
      }
    }
    for (const key of ["showChart", "showJourney", "motion"] as const) {
      if (typeof source[key] === "boolean") result[key] = source[key];
    }
    // The see-through look was retired: it now opens as light. Accent and custom colour are no longer choices.
    if (source.theme === "glass") result.theme = "pearl";
    return result;
  } catch { return { ...DEFAULT_STUDIO }; }
}

/** Parents already contain their children. Never count both in a distribution. */
export function distributionCategories(categories: CategoryWithData[]) {
  const parents = new Set(categories.filter((c) => c.isParent).map((c) => c.categoryId));
  return categories.filter((c) => c.spent > 0 && (c.isParent || c.parentId == null || !parents.has(c.parentId)))
    .sort((a, b) => b.spent - a.spent);
}

export function budgetMetrics(budget: number, spent: number, selected: Date, now = new Date()) {
  const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const isCurrent = start.getTime() === current.getTime();
  const isPast = start < current;
  const days = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
  const daysLeft = days - now.getDate() + 1;
  const remaining = budget - spent;
  return {
    remaining, isCurrent, isPast,
    daily: budget > 0 && isCurrent ? Math.max(0, remaining) / daysLeft : null,
    forecast: isCurrent && now.getDate() >= 5 ? spent / now.getDate() * days : null,
    elapsed: isCurrent ? now.getDate() / days * 100 : isPast ? 100 : 0,
    used: budget > 0 ? spent / budget * 100 : 0,
  };
}

/** Derive a readable foreground accent while preserving the chosen hue. */
export function readableAccent(hex: string, dark: boolean) {
  let rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
  const luminance = () => rgb.map(v => { const s=v/255; return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4; }).reduce((sum,v,i) => sum+v*[0.2126,0.7152,0.0722][i],0);
  for (let i=0;i<100 && (dark ? luminance()<0.45 : luminance()>0.16);i++) rgb=rgb.map(v => dark ? v+(255-v)*0.08 : v*0.92);
  return "#"+rgb.map(v=>Math.round(v).toString(16).padStart(2,"0")).join("");
}
