export const WIDGETS = ["thisMonth", "bills", "goals", "planner", "needsAttention", "cashFlow", "historicalTrend", "categories", "recentTransactions", "topMerchants", "bankHealth"] as const;
export type WidgetId = typeof WIDGETS[number];
export type Tile = { id: WidgetId; wide: boolean; tall: boolean; visible: boolean };
export type LayoutPreset = "daily" | "planning" | "minimal";
export function presetLayout(preset: LayoutPreset): Tile[] {
  const featured: WidgetId[] = preset === "planning" ? ["planner", "goals", "cashFlow", "bills"] : preset === "minimal" ? ["bills", "needsAttention"] : ["needsAttention", "thisMonth", "historicalTrend", "recentTransactions", "categories", "bills", "goals", "bankHealth"];
  return [...featured, ...WIDGETS.filter(id => !featured.includes(id))].map(id => ({ id, wide: id === "planner" || id === "categories", tall: false, visible: featured.includes(id) || preset === "daily" && ["recentTransactions", "bankHealth"].includes(id) }));
}
export function parseLayout(raw: unknown): Tile[] {
  if (!Array.isArray(raw)) return presetLayout("daily");
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (const item of raw) {
    if (!item || !WIDGETS.includes(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    tiles.push({ id: item.id, wide: item.wide === true, tall: item.tall === true, visible: item.visible !== false });
  }
  return [...tiles, ...presetLayout("daily").filter(t => !seen.has(t.id))];
}
