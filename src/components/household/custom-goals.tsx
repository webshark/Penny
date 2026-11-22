"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { getCashflowHealth, getPlan, savePlanItem } from "@/lib/api";
import { shekels } from "@/lib/money";
import { GOAL_COLORS, goalMonthly, goalReachMonth, type GoalColor } from "@/lib/plan";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { CardShell } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField, numberError } from "@/components/ui/number-field";
import type { Goal } from "@/lib/types";

const ICONS = ["🎯", "🏠", "🚗", "✈️", "🎓", "💍", "👶", "💻", "🛟", "🐶", "🎸"];
const COLOR_VAR: Record<GoalColor, string> = { indigo: "var(--chart-1)", green: "var(--bucket-saving)", amber: "var(--bucket-want)", orange: "var(--chart-5)", red: "var(--status-over)" };

type Draft = { id?: number; name: string; targetAmount: string; targetDate: string; savedAmount: string; monthly: string; icon: string; color: GoalColor };
const empty = (): Draft => ({ name: "", targetAmount: "", targetDate: "", savedAmount: "0", monthly: "", icon: ICONS[0], color: "indigo" });

/** Custom goals: create, edit and delete; shows the monthly saving needed, or when a monthly contribution gets there. */
export function CustomGoals() {
  const t = useTranslations("customGoals");
  const tc = useTranslations("calculators");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = useUndoableDelete<Goal & Record<string, unknown>>("goal", "plan", (g) => g.id, (g) => g.name);
  const goals = (q.data?.goals ?? []).filter((g) => g.kind !== "vacation");
  const now = new Date();
  const $ = (n: number) => shekels(Math.round(n), locale);
  // Behind = a dated goal whose set monthly saving is below what the date needs.
  const isBehind = (g: Goal) => g.dated !== false && g.savedAmount < g.targetAmount && !!g.monthly && goalMonthly(g.targetAmount, g.savedAmount, g.targetDate, now) > g.monthly;
  const [filter, setFilter] = useState<"all" | "behind">("all");
  const behindCount = goals.filter(isBehind).length;
  const shown = filter === "behind" ? goals.filter(isBehind) : goals;
  const health = useQuery({ queryKey: ["cashflow-health"], queryFn: getCashflowHealth });
  const saving = health.data?.hasData ? Math.max(0, health.data.avgIncome - health.data.avgExpenses) : null;
  const needTotal = goals.filter((g) => g.dated !== false && g.savedAmount < g.targetAmount).reduce((sum, g) => sum + goalMonthly(g.targetAmount, g.savedAmount, g.targetDate, now), 0);
  const monthName = (ym: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${ym}-15T12:00:00`));

  /** One line: monthly needed by the date, or when the monthly contribution reaches the target. */
  function plan(target: number, saved: number, date: string | null, monthly: number | null) {
    if (target > 0 && saved >= target) return t("reached");
    if (date) {
      const need = goalMonthly(target, saved, date, now);
      return monthly ? t("neededVs", { need: $(need), monthly: $(monthly) }) : t("needed", { need: $(need), date: monthName(date) });
    }
    const reach = goalReachMonth(target, saved, monthly, now);
    return reach ? t("reachBy", { monthly: $(monthly ?? 0), date: monthName(reach) }) : null;
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      await savePlanItem("goal", {
        id: draft.id, name: draft.name, targetAmount: Number(draft.targetAmount), savedAmount: Number(draft.savedAmount || 0),
        targetDate: draft.targetDate || null, dated: !!draft.targetDate, monthly: draft.monthly ? Number(draft.monthly) : null, icon: draft.icon, color: draft.color,
      });
      await qc.invalidateQueries({ queryKey: ["plan"] });
      setDraft(null);
      toast.success(t("savedToast"));
    } catch { toast.error(t("saveFailed")); } finally { setBusy(false); }
  }

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const preview = draft && Number(draft.targetAmount) > 0 ? plan(Number(draft.targetAmount), Number(draft.savedAmount || 0), draft.targetDate || null, Number(draft.monthly) || null) : null;
  const missingWhen = !!draft && !draft.targetDate && !(Number(draft.monthly) > 0);
  const badNumbers = !!draft && (!(Number(draft.targetAmount) > 0) || [draft.savedAmount, draft.monthly].some((x) => numberError(x, "x")));

  return (
    <CardShell id="goals" label={t("title")} className="scroll-mt-20" action={!draft && <Button size="sm" variant="outline" onClick={() => setDraft(empty())}><Plus aria-hidden />{t("new")}</Button>}>
      {draft ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!missingWhen && !badNumbers) void save(); }}>
          <label className="block space-y-1.5 text-sm font-medium">{t("name")}<Input required maxLength={60} placeholder={t("namePlaceholder")} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField id="cg-target" label={t("target")} unit="₪" min="1" value={draft.targetAmount} onChange={(v) => set({ targetAmount: v })} error={numberError(draft.targetAmount, tc("invalid"))} />
            <NumberField id="cg-saved" label={t("saved")} unit="₪" value={draft.savedAmount} onChange={(v) => set({ savedAmount: v })} error={numberError(draft.savedAmount, tc("invalid"))} />
            <div className="space-y-1.5"><Label htmlFor="cg-date" className="leading-5">{t("date")}</Label><Input id="cg-date" type="month" dir="ltr" value={draft.targetDate} onChange={(e) => set({ targetDate: e.target.value })} /></div>
            <NumberField id="cg-monthly" label={t("monthly")} unit="₪" value={draft.monthly} onChange={(v) => set({ monthly: v })} error={numberError(draft.monthly, tc("invalid"))} />
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t("icon")}</legend>
            <div className="flex flex-wrap gap-1">
              {ICONS.map((ic) => (
                <label key={ic} className="grid size-11 cursor-pointer place-items-center rounded-full text-xl has-checked:bg-primary/15 has-checked:ring-2 has-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-ring">
                  <input type="radio" name="goal-icon" className="sr-only" checked={draft.icon === ic} onChange={() => set({ icon: ic })} />
                  <span aria-hidden>{ic}</span><span className="sr-only">{ic}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t("color")}</legend>
            <div className="flex flex-wrap gap-1">
              {GOAL_COLORS.map((c) => (
                <label key={c} className="grid size-11 cursor-pointer place-items-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-ring">
                  <input type="radio" name="goal-color" className="sr-only" checked={draft.color === c} onChange={() => set({ color: c })} />
                  <span className={`size-7 rounded-full ${draft.color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`} style={{ backgroundColor: COLOR_VAR[c] }} aria-hidden />
                  <span className="sr-only">{t(`color_${c}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className={`text-sm ${missingWhen ? "text-status-heads-up" : "font-medium"}`} aria-live="polite">{missingWhen ? t("needWhen") : preview}</p>
          <div className="flex gap-2">
            <Button disabled={busy || missingWhen || badNumbers} type="submit">{t("save")}</Button>
            <Button disabled={busy} variant="ghost" type="button" onClick={() => setDraft(null)}>{t("cancel")}</Button>
          </div>
        </form>
      ) : goals.length === 0 ? (
        <p className="text-footnote text-pretty text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
        {needTotal > 0 && (() => {
          // What the goals need a month against what is actually saved a month.
          const short = saving !== null && saving < needTotal;
          return <p className={`mb-3 rounded-xl border px-4 py-3 text-sm ${short ? "border-[var(--status-heads-up)]/30 bg-[var(--status-heads-up)]/10 text-[var(--status-heads-up)]" : "border-status-on-track/30 bg-status-on-track/10 text-status-on-track"}`}>
            {t("needTotal", { need: $(needTotal) })}{saving !== null && <> {t(short ? "needShort" : "needCovered", { save: $(saving), gap: $(needTotal - saving) })}</>}
          </p>;
        })()}
        <div role="group" aria-label={t("filterLabel")} className="mb-3 flex gap-1.5">
          {(["all", "behind"] as const).map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-9 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${filter === f ? "bg-foreground font-medium text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{t(f === "all" ? "filterAll" : "filterBehind", { n: behindCount })}</button>)}
        </div>
        {([["active", shown.filter((g) => g.savedAmount < g.targetAmount)], ["ended", shown.filter((g) => g.savedAmount >= g.targetAmount)]] as const).filter(([, list]) => list.length > 0).map(([section, list]) => (
        <section key={section} aria-label={t(section)} className="mb-4 last:mb-0">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t(section)} · {list.length}</h3>
        <ul className="space-y-3">
          {list.map((g) => {
            const color = COLOR_VAR[g.color ?? "indigo"];
            const pct = Math.min(100, Math.max(0, (g.savedAmount / g.targetAmount) * 100));
            return (
              <li key={g.id} className="rounded-xl bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full text-xl" style={{ backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)` }} aria-hidden>{g.icon && !/^[a-z-]+$/i.test(g.icon) ? g.icon : "🎯"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.name}</p>
                    <p className="text-footnote text-muted-foreground">{t("savedOf", { saved: $(g.savedAmount), total: $(g.targetAmount) })}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={t("edit", { name: g.name })} onClick={() => setDraft({
                    id: g.id, name: g.name, targetAmount: String(g.targetAmount), savedAmount: String(g.openingSavedAmount ?? g.savedAmount),
                    targetDate: g.dated === false ? "" : g.targetDate, monthly: g.monthly ? String(g.monthly) : "", icon: g.icon ?? ICONS[0], color: g.color ?? "indigo",
                  })}><Pencil aria-hidden /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("delete", { name: g.name })} disabled={remove.isPending} onClick={() => remove.mutate(g as Goal & Record<string, unknown>)}><Trash2 aria-hidden /></Button>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={g.name} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{plan(g.targetAmount, g.savedAmount, g.dated === false ? null : g.targetDate, g.monthly ?? null)}</span><span className="flex items-center gap-2">{isBehind(g) && <span className="rounded-full bg-[var(--status-heads-up)]/15 px-2 py-0.5 text-xs font-medium text-[var(--status-heads-up)]">{t("behindBadge")}</span>}<bdi className="font-semibold tabular-nums">{Math.round(pct)}%</bdi></span></p>
              </li>
            );
          })}
        </ul>
        </section>
        ))}
        </>
      )}
    </CardShell>
  );
}
