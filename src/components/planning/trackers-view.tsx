"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { getCategories, getSummary } from "@/lib/api";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { parseTrackers, trackerStatus, type Tracker } from "@/lib/trackers";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Trackers: chosen categories over a date range against a limit, saved per profile. */
export function TrackersView() {
  const t = useTranslations("trackers");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const qc = useQueryClient();
  const pref = useQuery({ queryKey: ["preference", "trackers"], queryFn: () => loadPreference("trackers") });
  const trackers = parseTrackers(pref.data);
  const cats = useQuery({ queryKey: ["categories", "expense"], queryFn: () => getCategories("expense") });
  const summaries = useQueries({ queries: trackers.map((x) => ({ queryKey: ["summary", x.from, x.to], queryFn: () => getSummary({ from: x.from, to: x.to }) })) });
  const [draft, setDraft] = useState<Tracker | null>(null);
  const now = today();
  const money = (n: number) => shekels(Math.round(n), locale);
  const date = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));
  const catName = (id: number) => { const c = cats.data?.find((x) => x.id === id); return c ? translateCategoryName(c.name, tCat) : ""; };

  function save(next: Tracker[]) {
    qc.setQueryData(["preference", "trackers"], next);
    return storePreference("trackers", next).catch(() => toast.error(t("saveFailed")));
  }

  const parents = (cats.data ?? []).filter((c) => c.parentId == null);
  const childrenOf = (id: number) => (cats.data ?? []).filter((c) => c.parentId === id);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!draft && <Button onClick={() => setDraft({ id: crypto.randomUUID(), name: "", categoryIds: [], from: now, to: plusDays(now, 29), limit: 0 })}><Plus aria-hidden />{t("new")}</Button>}
      </div>

      {draft && (
        <form className="space-y-4 rounded-2xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void save([...trackers, { ...draft, name: draft.name.trim() }]).then(() => setDraft(null)); }}>
          <h2 className="text-[15px] font-semibold">{t("new")}</h2>
          <label className="block space-y-1.5 text-sm font-medium">{t("name")}<Input required maxLength={40} value={draft.name} placeholder={t("namePlaceholder")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm font-medium">{t("from")}<Input type="date" dir="ltr" required value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("to")}<Input type="date" dir="ltr" required min={draft.from} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("limit")}<Input type="number" inputMode="decimal" min="1" required value={draft.limit || ""} onChange={(e) => setDraft({ ...draft, limit: Number(e.target.value) })} /></label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("categories")}</legend>
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-2">
              {parents.map((p) => [p, ...childrenOf(p.id)]).flat().map((c) => (
                <label key={c.id} className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent ${c.parentId ? "ps-7 text-muted-foreground" : "font-medium"}`}>
                  <input type="checkbox" className="size-4" checked={draft.categoryIds.includes(c.id)} onChange={(e) => setDraft({ ...draft, categoryIds: e.target.checked ? [...draft.categoryIds, c.id] : draft.categoryIds.filter((x) => x !== c.id) })} />
                  <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />{translateCategoryName(c.name, tCat)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={!draft.name.trim() || !draft.categoryIds.length || !(draft.limit > 0) || draft.to < draft.from}>{t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {pref.isError ? <p role="alert" className="text-sm">{t("loadFailed")}</p>
        : !pref.isFetched ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
        : trackers.length === 0 && !draft ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <Target className="mx-auto mb-3 size-8 text-primary" aria-hidden />
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("emptyHint")}</p>
          </div>
        ) : trackers.length > 0 && (
          <section aria-label={t("title")} className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {trackers.map((x, i) => {
                const data = summaries[i]?.data;
                const s = trackerStatus(x, (data?.categoriesWithData ?? []).map((c) => ({ categoryId: c.categoryId, parentId: c.parentId, spent: c.spent })), now);
                const pct = Math.round(s.used * 100);
                const chip = s.state === "ended" ? t("ended") : s.state === "upcoming" ? t("upcoming") : s.daysLeft === 1 ? t("lastDay") : t("daysLeft", { n: s.daysLeft });
                return (
                  <li key={x.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={x.name}>{x.name}</p>
                      <p className="truncate text-xs text-muted-foreground" title={x.categoryIds.map(catName).join(", ")}>{date(x.from)} – {date(x.to)} · {x.categoryIds.map(catName).filter(Boolean).join(", ")}</p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{t("used")}</span><span className="flex items-center gap-1.5"><bdi className={`font-semibold tabular-nums ${s.over ? "text-expense" : ""}`}>{data ? `${pct}%` : "…"}</bdi><span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">{chip}</span></span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t("usedOf", { name: x.name })} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className={`h-full rounded-full ${s.over ? "bg-expense" : "bg-status-on-track"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <Link href={`/transactions?month=${x.to.slice(0, 7)}`} className="text-end text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        <bdi className={`block font-semibold tabular-nums ${s.over ? "text-expense" : ""}`} data-money>{money(s.spent)}</bdi>
                        <span className="text-xs text-muted-foreground">{t("ofLimit", { limit: money(x.limit) })}</span>
                      </Link>
                      <Button size="icon" variant="ghost" aria-label={t("delete", { name: x.name })} onClick={() => { if (window.confirm(t("confirmDelete", { name: x.name }))) void save(trackers.filter((y) => y.id !== x.id)); }}><Trash2 aria-hidden /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
    </div>
  );
}
