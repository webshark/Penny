"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Back, Forward } from "@/components/ui/dir-chevron";
import { getOverview, getSettings } from "@/lib/api";
import { shekels } from "@/lib/money";

/** "YYYY-MM" for a date's month. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
};
const keyDate = (key: string) => new Date(`${key}-15T12:00:00`);

type Props = { value: string; onChange: (month: string) => void; /** The newest month you can pick (this month). */ max?: string };

/** Per-month income/spend from the overview (years cached with the Summary tab) and the monthly budget. */
function useMonthFlow(value: string) {
  // This year, last year, and the year before the picked month, so its previous month is known too.
  const back = Math.max(0, new Date().getFullYear() - Number(shiftMonth(value, -1).slice(0, 4)));
  const years = [...new Set([0, 1, back])].filter((k) => k <= 120);
  const qs = useQueries({ queries: years.map((k) => ({ queryKey: ["overview", "year", k], queryFn: () => getOverview("year", k) })) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const flow = new Map(qs.flatMap((q) => q.data?.monthly ?? []).map((m) => [m.month, m]));
  const loaded = new Set(qs.flatMap((q) => q.data?.period.months ?? []));
  return {
    flow,
    budget: settings.data?.monthlyTarget ?? 0,
    // Unknown (still loading, or outside the loaded years) counts as available, so nothing locks up.
    has: (m: string) => !loaded.has(m) || (flow.get(m)?.income ?? 0) !== 0 || (flow.get(m)?.expenses ?? 0) !== 0,
  };
}

/** ‹ label › for a purple hero's top row; a reset chip when away from the newest period. Arrows to a period without data are disabled. */
export function PagerNav({ label, ariaLabel, prevLabel, nextLabel, onPrev, onNext, prevDisabled, nextDisabled, resetLabel, onReset }: {
  label: React.ReactNode; ariaLabel: string; prevLabel: string; nextLabel: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean; resetLabel?: string; onReset?: () => void;
}) {
  const t = useTranslations("nav");
  // aria-disabled (not disabled) keeps the arrow focusable, so its "no data" hint can be read.
  const arrow = (dir: "prev" | "next", off: boolean | undefined, onClick: () => void, name: string) => (
    <button type="button" className="month-nav-arrow" aria-disabled={off || undefined} title={off ? t("noData") : undefined}
      onClick={() => { if (!off) onClick(); }} aria-label={off ? `${name} · ${t("noData")}` : name}>{dir === "prev" ? <Back className="size-5" /> : <Forward className="size-5" />}</button>
  );
  return (
    <div className="month-nav" role="group" aria-label={ariaLabel}>
      {arrow("prev", prevDisabled, onPrev, prevLabel)}
      <span className="month-nav-label" aria-live="polite">{label}</span>
      {arrow("next", nextDisabled, onNext, nextLabel)}
      {/* Icon only: away from the newest month the chip must not push the label around. */}
      {onReset && <button type="button" className="month-nav-today" onClick={onReset} aria-label={resetLabel} title={resetLabel}><RotateCcw className="size-4" aria-hidden /></button>}
    </div>
  );
}

/** The month line inside a purple hero: ‹ November 2026 ›, a chip back to this month, and swipe on the whole hero. */
export function MonthNav({ value, onChange, max = monthKey(new Date()) }: Props) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { has } = useMonthFlow(value);
  const prev = shiftMonth(value, -1), next = shiftMonth(value, 1);
  const canPrev = has(prev), canNext = next <= max && has(next);
  const ref = useRef<HTMLDivElement>(null);
  const go = useRef<(dir: 1 | -1) => void>(() => {});
  useEffect(() => { go.current = (dir) => { if (dir === 1 ? canNext : canPrev) onChange(dir === 1 ? next : prev); }; });
  // Horizontal swipe on the hero that holds this line; towards the reading direction is the next month.
  useEffect(() => {
    const hero = ref.current?.closest<HTMLElement>(".studio-overview, .wallet");
    if (!hero) return;
    let x0 = 0, y0 = 0;
    const start = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    const end = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest(".month-strip")) return; // the strip scrolls on its own
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const rtl = getComputedStyle(hero).direction === "rtl";
      go.current((rtl ? dx > 0 : dx < 0) ? 1 : -1);
    };
    hero.addEventListener("touchstart", start, { passive: true });
    hero.addEventListener("touchend", end);
    return () => { hero.removeEventListener("touchstart", start); hero.removeEventListener("touchend", end); };
  }, []);
  return <div ref={ref} className="contents"><PagerNav label={keyDate(value).toLocaleDateString(locale, { month: "long", year: "numeric" })} ariaLabel={t("monthNav")}
    prevLabel={t("prevMonth")} nextLabel={t("nextMonth")} onPrev={() => onChange(prev)} onNext={() => onChange(next)}
    prevDisabled={!canPrev} nextDisabled={!canNext} resetLabel={t("backToCurrent")} onReset={value !== max ? () => onChange(max) : undefined} /></div>;
}

/**
 * Twelve months as small pills: a spending bar each, tinted by status against the monthly budget (green within,
 * warm over, neutral without a budget; the status is also in each pill's name and a mark on over months).
 * One tab stop, arrows move along it (radio group); months without data are disabled.
 */
export function MonthStrip({ value, onChange, max = monthKey(new Date()) }: Props) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { flow, budget, has } = useMonthFlow(value);
  const oldest = value < shiftMonth(max, -11) ? value : shiftMonth(max, -11);
  const months: string[] = [];
  for (let m = oldest; m <= max; m = shiftMonth(m, 1)) months.push(m);
  const top = Math.max(1, ...months.map((m) => flow.get(m)?.expenses ?? 0));
  // Overrun: past the monthly target when one is set, otherwise a month running well above the usual month (a spike).
  const settled = months.map((m) => flow.get(m)?.expenses ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  const baseline = settled.length >= 3 ? settled[Math.floor(settled.length / 2)] : 0;
  const statusOf = (v: number | undefined): "over" | "ok" | undefined => {
    if (!v) return undefined;
    if (budget) return v > budget ? "over" : "ok";
    return baseline > 0 && v > baseline * 1.25 ? "over" : undefined;
  };
  const ref = useRef<HTMLDivElement>(null);

  // Keep the picked pill in view without scrolling the page (scrollIntoView would).
  useEffect(() => {
    const c = ref.current, el = c?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!c || !el) return;
    const a = el.getBoundingClientRect(), b = c.getBoundingClientRect();
    c.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [value, months.length]);

  const onKey = (e: KeyboardEvent) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    const open = months.filter((m) => m === value || has(m));
    const i = open.indexOf(value);
    const next = e.key === "Home" ? open[0] : e.key === "End" ? open.at(-1) : step ? open[Math.max(0, Math.min(open.length - 1, i + step))] : undefined;
    if (!next) return;
    e.preventDefault();
    onChange(next);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div ref={ref} className="month-strip" role="radiogroup" aria-label={t("monthNav")} onKeyDown={onKey}>
      {months.map((m) => {
        const d = keyDate(m);
        const v = flow.get(m)?.expenses;
        const name = d.toLocaleDateString(locale, { month: "long", year: "numeric" });
        const on = m === value;
        const off = !on && !has(m);
        const status = statusOf(v);
        const overText = t(budget ? "monthOver" : "monthSpike");
        const label = [v ? t("monthSpent", { month: name, amount: shekels(v, locale) }) : name, status && t(status === "over" ? (budget ? "monthOver" : "monthSpike") : "monthOk"), off && t("noData")].filter(Boolean).join(" · ");
        return (
          <button key={m} type="button" role="radio" aria-checked={on} aria-disabled={off || undefined} tabIndex={on ? 0 : -1}
            onClick={() => { if (!off) onChange(m); }} title={off ? t("noData") : status === "over" ? overText : undefined} aria-label={label} className="month-pill" data-status={status}>
            <span className="month-pill-bar" aria-hidden><i style={{ height: `${Math.max(6, ((v ?? 0) / top) * 100)}%` }} /></span>
            <span aria-hidden>{d.toLocaleDateString(locale, { month: "short" })}</span>
          </button>
        );
      })}
    </div>
  );
}
