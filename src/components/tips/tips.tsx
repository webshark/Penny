"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useMessages } from "next-intl";
import type en from "@/i18n/messages/en.json";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Search, X } from "lucide-react";
import { dismissSuggestion, getSettings, getSuggestions } from "@/lib/api";
import { TIPS, TIP_CATEGORIES, relevantTips, tipKey, tipOfDay, tipSignals, type Tip, type TipCategory } from "@/lib/tips";
import { CardShell } from "@/components/home/card-shell";
import { IconButton } from "@/components/ui/icon-button";


type TipsCopy = (typeof en)["tipsUi"];

function useLabels() {
  const locale = useLocale();
  return { l: (useMessages() as unknown as { tipsUi: TipsCopy }).tipsUi, lang: (locale === "he" ? "he" : "en") as "he" | "en" };
}

/** Household signals and dismissed tip keys, shared by every tip surface. */
function useTipState() {
  const queryClient = useQueryClient();
  const suggestions = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const types = (suggestions.data?.suggestions ?? []).map((s) => s.type).join();
  const hh = settings.data?.household;
  const hasKids = !!hh && (hh.members.some((m) => m.role === "child") || hh.events.some((e) => e.type === "newChild" || e.type === "birth"));
  const signals = useMemo(() => tipSignals(types ? types.split(",") : [], { hasKids, today }), [types, hasKids, today]);
  const dismissed = useMemo(() => new Set(suggestions.data?.dismissed ?? []), [suggestions.data]);
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissSuggestion(tipKey(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
  });
  return { ready: !suggestions.isPending, signals, dismissed, today, dismiss: (id: string) => dismiss.mutate(id) };
}

function TipItem({ tip, onDismiss }: { tip: Tip; onDismiss: () => void }) {
  const { l, lang } = useLabels();
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden><Lightbulb className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-caption font-medium text-muted-foreground">{l.cat[tip.category]}</p>
        <h3 className="text-headline font-semibold">{tip[lang].title}</h3>
        <p className="mt-0.5 text-footnote text-pretty text-muted-foreground">{tip[lang].body}</p>
        {tip.href && <Link href={tip.href} className="mt-1 inline-flex min-h-11 items-center text-footnote font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{l.open}</Link>}
      </div>
      <IconButton label={l.notRelevant} variant="ghost" onClick={onDismiss}><X className="size-4" aria-hidden /></IconButton>
    </div>
  );
}

const Disclaimer = () => <p className="mt-3 text-caption text-muted-foreground">{useLabels().l.disclaimer}</p>;

/** Rotating tip of the day, preferring tips that match the household. With `bare`, no card frame (for a host card). */
export function DailyTip({ bare }: { bare?: boolean } = {}) {
  const { l } = useLabels();
  const s = useTipState();
  const tip = s.ready ? tipOfDay(s.signals, s.dismissed, s.today) : null;
  if (!tip) return null;
  if (bare) return (
    <>
      <TipItem tip={tip} onDismiss={() => s.dismiss(tip.id)} />
      <div className="flex items-center justify-between gap-3">
        <Disclaimer />
        <Link href="/tips" className="mt-3 inline-flex min-h-11 items-center text-footnote font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{l.library}</Link>
      </div>
    </>
  );
  return (
    <CardShell label={l.daily} action={<Link href="/tips" className="hover:underline">{l.library}</Link>} className="h-auto">
      <TipItem tip={tip} onDismiss={() => s.dismiss(tip.id)} />
      <Disclaimer />
    </CardShell>
  );
}

/** A few tips for one page's topic, relevant ones first. Hidden when none are left. */
export function ContextTips({ categories, limit = 3 }: { categories: TipCategory[]; limit?: number }) {
  const { l } = useLabels();
  const s = useTipState();
  if (!s.ready) return null;
  const tips = categories.flatMap((c) => relevantTips(s.signals, s.dismissed, c)).slice(0, limit);
  if (!tips.length) return null;
  return (
    <CardShell label={l.forYou} action={<Link href="/tips" className="hover:underline">{l.library}</Link>} className="h-auto">
      <div className="space-y-4">{tips.map((t) => <TipItem key={t.id} tip={t} onDismiss={() => s.dismiss(t.id)} />)}</div>
      <Disclaimer />
    </CardShell>
  );
}

/** Every tip, filterable by category and searchable. */
export function TipsLibrary() {
  const { l, lang } = useLabels();
  const s = useTipState();
  const [cat, setCat] = useState<TipCategory | null>(null);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const tips = TIPS.filter((t) => !s.dismissed.has(tipKey(t.id)) && (!cat || t.category === cat) && (!needle || `${t[lang].title} ${t[lang].body}`.toLowerCase().includes(needle)));
  const chip = (active: boolean) => `min-h-11 shrink-0 rounded-full px-4 text-footnote font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`;
  return (
    <div className="space-y-4">
      <DailyTip />
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={l.search} aria-label={l.search}
          className="h-11 w-full rounded-xl border border-input bg-card ps-10 pe-4 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring sm:text-sm" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0" role="group" aria-label={l.tips}>
        <button type="button" className={chip(!cat)} aria-pressed={!cat} onClick={() => setCat(null)}>{l.all}</button>
        {TIP_CATEGORIES.map((c) => <button key={c} type="button" className={chip(cat === c)} aria-pressed={cat === c} onClick={() => setCat(c)}>{l.cat[c]}</button>)}
      </div>
      {tips.length === 0 ? <p className="py-8 text-center text-footnote text-muted-foreground">{l.none}</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tips.map((t) => <li key={t.id} className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5"><TipItem tip={t} onDismiss={() => s.dismiss(t.id)} /></li>)}
        </ul>
      )}
      <Disclaimer />
    </div>
  );
}

