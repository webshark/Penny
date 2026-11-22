"use client";
import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getPlan, savePlanItem } from "@/lib/api";
import { useActiveProfileId } from "@/lib/workspace-store";
import { shekels } from "@/lib/money";
import { CardShell, CardError, CardSkeleton } from "./card-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Goal } from "@/lib/types";

const noSubscribe = () => () => {}; // read once per render; this component's own writes go through state

export function GoalFocus() {
  const locale = useLocale(); const t = useTranslations("goalFocus"); const title = t("smallStepsMeaningfulGoals");
  const q = useQuery({ queryKey: ["plan"], queryFn: getPlan }); const qc = useQueryClient();
  const profileId = useActiveProfileId(); // per profile
  const focusKey = `penny.goal-focus.p${profileId ?? "default"}`;
  const stored = useSyncExternalStore(noSubscribe, () => { try { return Number(localStorage.getItem(focusKey)) || null; } catch { return null; } }, () => null);
  const [chosen, setSelected] = useState<{ key: string; id: number } | null>(null);
  const selected = chosen?.key === focusKey ? chosen.id : stored;
  const [draft, setDraft] = useState<Partial<Goal> | null>(null); const [busy, setBusy] = useState(false);
  const [prevFocusKey, setPrevFocusKey] = useState(focusKey);
  if (focusKey !== prevFocusKey) { setPrevFocusKey(focusKey); setDraft(null); }
  if (q.isPending) return <CardSkeleton label={title} />;
  if (q.isError) return <CardError label={title} />;
  const goal = q.data.goals.find(g => g.id === selected) ?? q.data.goals[0];
  const pct = goal ? Math.min(100, Math.max(0, goal.savedAmount / goal.targetAmount * 100)) : 0;
  async function save() {
    if (!draft) return;
    setBusy(true);
    try { await savePlanItem("goal", draft); await qc.invalidateQueries({ queryKey: ["plan"] }); setDraft(null); toast.success(t("goalSaved")); }
    catch { toast.error(t("couldNotSaveTry")); }
    finally { setBusy(false); }
  }
  return <CardShell label={title}>
    {draft ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="block space-y-1 text-sm">{t("whatAreYouSaving")}<Input required maxLength={60} value={draft.name ?? ""} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">{t("target")}<Input required type="number" min="0.01" step="0.01" value={draft.targetAmount ?? ""} onChange={e => setDraft({ ...draft, targetAmount: Number(e.target.value) })} /></label><label className="space-y-1 text-sm">{t("openingSavings")}<Input required type="number" min="0" step="0.01" value={draft.savedAmount ?? 0} onChange={e => setDraft({ ...draft, savedAmount: Number(e.target.value) })} /></label></div>
      <label className="block space-y-1 text-sm">{t("targetMonth")}<Input required type="month" value={draft.targetDate ?? ""} onChange={e => setDraft({ ...draft, targetDate: e.target.value })} /></label>
      <p className="text-xs text-muted-foreground">{t("savingsAreSelfReported")}</p>
      <div className="flex gap-2"><Button disabled={busy} type="submit">{t("save")}</Button><Button disabled={busy} variant="ghost" type="button" onClick={() => setDraft(null)}>{t("cancel")}</Button></div>
    </form> : <>
      {goal ? <><label className="block text-sm">{t("myFocus")}<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" value={goal.id} onChange={e => { setSelected({ key: focusKey, id: Number(e.target.value) }); try { localStorage.setItem(focusKey, e.target.value); } catch { toast.error(t("couldNotSaveYour")); } }}>{q.data.goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label><p className="mt-4 text-3xl font-semibold"><bdi>{shekels(goal.savedAmount, locale)}</bdi><span className="ms-2 text-sm font-normal text-muted-foreground">{t("of")} {shekels(goal.targetAmount, locale)}</span></p><progress aria-label={goal.name} value={pct} max={100} className="mt-4 h-3 w-full accent-primary" /><div className="mt-2 flex justify-between text-xs">{[25, 50, 75, 100].map(n => <span key={n} className={pct >= n ? "font-semibold text-primary" : "text-muted-foreground"}>{pct >= n ? "✓ " : ""}{n}%</span>)}</div><p className="mt-3 text-sm text-muted-foreground">{pct >= 100 ? t("youReachedYourGoal") : t("everyStepCountsYou")}</p><Button className="mt-3" variant="outline" onClick={() => setDraft({ ...goal, savedAmount: goal.openingSavedAmount ?? goal.savedAmount })}>{t("updateProgress")}</Button></> : <p className="text-muted-foreground">{t("chooseSomethingMeaningfulAn")}</p>}
      <Button className="mt-3 ms-2" variant="ghost" onClick={() => setDraft({ name: "", savedAmount: 0, targetDate: new Date().toISOString().slice(0, 7) })}>{t("newGoal")}</Button>
    </>}
  </CardShell>;
}
