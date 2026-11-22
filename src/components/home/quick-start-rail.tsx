"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Circle, X } from "lucide-react";
import { getAssets, getHome, getPlan, getTagReport } from "@/lib/api";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { quickStart, type QuickStartTaskId } from "@/lib/quick-start";

const OPEN_KEY = "penny.quick-start.open";
const DISMISSED = "quick-start-dismissed";
const noSubscribe = () => () => {};
const listOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Quick start beside the dashboard: setup tasks that tick themselves from real data. */
export function QuickStartRail() {
  const t = useTranslations("quickStart");
  const qc = useQueryClient();
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => getTagReport() });
  const trackers = useQuery({ queryKey: ["preference", "trackers"], queryFn: () => loadPreference("trackers") });
  const views = useQuery({ queryKey: ["preference", "transaction-views"], queryFn: () => loadPreference("transaction-views") });
  const activation = useQuery({ queryKey: ["preference", "activation"], queryFn: () => loadPreference("activation") });
  const stored = useSyncExternalStore(noSubscribe, () => { try { return localStorage.getItem(OPEN_KEY); } catch { return null; } }, () => null);
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const open = openOverride ?? stored !== "0";
  const marked = listOf(activation.data);

  if (!activation.isFetched || marked.includes(DISMISSED)) return null;
  const q = quickStart({
    bankConnected: (home.data?.bankHealth ?? []).some((b) => b.status === "ok" || b.status === "stale"),
    budgetSet: (home.data?.thisMonth?.budget ?? 0) > 0,
    uncategorized: home.data?.needsAttention ? home.data.needsAttention.uncategorized : null,
    goals: plan.data?.goals.length ?? 0,
    trackers: Array.isArray(trackers.data) ? trackers.data.length : 0,
    tags: tags.data?.tags.length ?? 0,
    views: Array.isArray(views.data) ? views.data.length : 0,
    assets: (assets.data?.assets ?? []).filter((a) => a.source !== "bank").length,
    marked,
  });
  if (q.remaining === 0) return null;
  const pct = Math.round((q.done / q.total) * 100);

  function setOpen(next: boolean) {
    setOpenOverride(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* the choice just won't be remembered */ }
  }
  function saveMarked(next: string[]) {
    qc.setQueryData(["preference", "activation"], next);
    void storePreference("activation", next).catch(() => toast.error(t("saveFailed")));
  }
  const toggleMark = (id: QuickStartTaskId) => saveMarked(marked.includes(id) ? marked.filter((x) => x !== id) : [...marked, id]);

  const ring = (
    <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--muted)" strokeWidth="3" />
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct} 100`} pathLength={100} />
    </svg>
  );

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} aria-label={t("openLabel", { n: q.remaining })}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring xl:sticky xl:top-[calc(var(--app-header-h,0px)+16px)] xl:w-14 xl:flex-col xl:py-4">
      <ChevronLeft className="hidden size-4 text-muted-foreground xl:block ltr:rotate-180" aria-hidden />
      <span className="relative grid place-items-center">{ring}<span className="absolute text-[11px] font-semibold tabular-nums">{q.remaining}</span></span>
      <span className="font-medium xl:[writing-mode:vertical-rl]">{t("title")}</span>
    </button>
  );

  return (
    <aside aria-label={t("title")} className="rounded-2xl border border-border bg-card xl:sticky xl:top-[calc(var(--app-header-h,0px)+16px)] xl:w-80">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" aria-hidden /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t("progressLabel")} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1.5 flex justify-between text-xs text-muted-foreground"><span>{t("progress", { done: q.done, total: q.total })}</span><bdi>{pct}%</bdi></p>
      </div>
      <ul className="p-2">
        {q.groups.map((g) => {
          const isOpen = expanded === g.group;
          return (
            <li key={g.group}>
              <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : g.group)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-start text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className={`grid size-6 shrink-0 place-items-center rounded-full ${g.done === g.tasks.length ? "bg-status-on-track/15 text-status-on-track" : "bg-primary/12 text-primary"}`}>{g.done === g.tasks.length ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}</span>
                <span className={`flex-1 font-medium ${g.done === g.tasks.length ? "text-muted-foreground" : ""}`}>{t(`group_${g.group}`)}</span>
                <span className="text-xs text-muted-foreground">{t("groupProgress", { done: g.done, total: g.tasks.length })}</span>
                {isOpen ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />}
              </button>
              {isOpen && (
                <ul className="mb-2 ms-5 border-s border-border ps-3">
                  {g.tasks.map((task) => (
                    <li key={task.id} className="flex min-h-11 items-center gap-2">
                      {task.auto ? <span className="grid size-5 shrink-0 place-items-center rounded-full bg-status-on-track/15 text-status-on-track" title={t("autoDone")}><Check className="size-3" aria-hidden /><span className="sr-only">{t("autoDone")}</span></span>
                        : <input type="checkbox" className="size-4 shrink-0" checked={task.done} aria-label={t("markDone", { task: t(`task_${task.id}`) })} onChange={() => toggleMark(task.id)} />}
                      <Link href={task.href} className={`flex-1 text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring ${task.done ? "text-muted-foreground line-through" : ""}`}>{t(`task_${task.id}`)}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border p-3 text-center">
        <button type="button" onClick={() => { if (window.confirm(t("dismissConfirm"))) saveMarked([...marked, DISMISSED]); }} className="min-h-10 rounded-lg px-3 text-sm text-expense hover:bg-expense/10 focus-visible:outline-2 focus-visible:outline-ring">{t("dismiss")}</button>
      </div>
    </aside>
  );
}
