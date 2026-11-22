"use client";

import { Forward, Back } from "@/components/ui/dir-chevron";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { getRecap } from "@/lib/api";
import type { MonthRecap, YearRecap } from "@/lib/recap";
import { budgetMonthByKey, budgetMonthRange, shiftBudgetMonthKey } from "@/lib/finance-period";
import { usePlan } from "@/hooks/use-plan";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { saveCardAsPng } from "./card-image";
import { useGentle } from "@/hooks/use-gentle";

export interface StoryCard { title: string; text: string; figure?: string }

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const pct = (a: number, b: number) => Math.round((Math.abs(a - b) / b) * 100);

export function RecapStory() {
  const t = useTranslations("recap");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const gentle = useGentle();
  const router = useRouter();
  const params = useSearchParams();
  const yearParam = params.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const today = todayIso();
  // Month keys and their dates are the household's periods, so the picker offers the same range
  // the recap and budgets use, and defaults to the last complete period.
  const { plan, loaded: planLoaded, failed: planFailed } = usePlan();
  const startDay = plan.monthStartDay;
  const currentKey = budgetMonthRange(startDay, today).key;
  const month = params.get("month") ?? shiftBudgetMonthKey(currentKey, -1);
  const periods = Array.from({ length: 13 }, (_, i) => budgetMonthByKey(startDay, shiftBudgetMonthKey(currentKey, -i)));
  const query = useQuery({
    queryKey: ["recap", year ?? month],
    queryFn: () => getRecap(year ? { year } : { month }),
    // Wait for the plan in month mode, so the default month is the household's, not the calendar one.
    enabled: !!year || planLoaded || planFailed,
  });
  const [index, setIndex] = useState(0);
  const money = (n: number) => shekels(n, locale);
  const cat = (name: string) => translateCategoryName(name, tCat);
  const monthName = (m: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const range = (from: string, to: string) => `${dayMonth.format(new Date(`${from}T12:00:00Z`))} – ${dayMonth.format(new Date(`${to}T12:00:00Z`))}`;
  const periodLabel = (from: string, to: string, key: string) => startDay === 1 ? monthName(key) : `${monthName(key)} (${range(from, to)})`;

  const data = query.data;
  const cards: StoryCard[] = !data ? [] : data.mode === "year" ? yearCards(data.recap) : monthCards(data.recap);
  const total = cards.length;
  const at = Math.min(index, Math.max(0, total - 1));

  function monthCards(r: MonthRecap): StoryCard[] {
    const name = monthName(r.month);
    if (!r.biggest) return [{ title: t("m1Title"), text: t("empty", { month: name }) }];
    const keptLine = r.income === 0 ? "" : r.kept >= 0 ? t("kept", { amount: money(r.kept) }) : t("over", { amount: money(-r.kept) });
    const first = r.prevSpent === 0 || r.spent === r.prevSpent ? t("m1Plain", { month: name, spent: money(r.spent) })
      : t(r.spent < r.prevSpent ? "m1Less" : "m1More", { month: name, spent: money(r.spent), diff: money(Math.abs(r.spent - r.prevSpent)) });
    const improved: StoryCard = { title: t("m5Title"), figure: r.improved ? money(r.improved.drop) : undefined, text: r.improved ? t("m5", { name: cat(r.improved.name), drop: money(r.improved.drop) }) : t("m5None") };
    const quiet: StoryCard = { title: t("m4Title"), figure: String(r.noSpendDays), text: [
      t("m4Days", { days: r.noSpendDays }),
      r.longestStreak > 1 && t("m4Streak", { streak: r.longestStreak }),
      r.underBudgetMonths != null && r.underBudgetMonths > 0 && t("m4Budget", { months: r.underBudgetMonths }),
    ].filter(Boolean).join(" ") };
    // Gentle: wins first, no month-to-month comparisons, no biggest expense, nothing to trim.
    if (gentle) return [
      ...(r.improved ? [improved] : []),
      quiet,
      { title: t("m1Title"), text: `${t("m1Plain", { month: name, spent: money(r.spent) })} ${r.income > 0 && r.kept > 0 ? t("kept", { amount: money(r.kept) }) : ""}`.trim() },
      ...(r.top ? [{ title: t("m2Title"), text: t("m2New", { name: cat(r.top.name), spent: money(r.top.spent) }) }] : []),
      { title: t("closeTitle"), text: t("m7_gentle") },
    ];
    return [
      // The outcome (money kept) leads when there is one.
      r.income > 0 && r.kept > 0
        ? { title: t("m1Title"), text: `${keptLine} ${first}`, figure: money(r.kept) }
        : { title: t("m1Title"), text: `${first} ${keptLine}`.trim(), figure: money(r.spent) },
      { title: t("m2Title"), figure: r.top ? money(r.top.spent) : undefined, text: !r.top ? t("m2None")
        : r.top.prev === 0 ? t("m2New", { name: cat(r.top.name), spent: money(r.top.spent) })
        : t(r.top.spent >= r.top.prev ? "m2Up" : "m2Down", { name: cat(r.top.name), spent: money(r.top.spent), pct: pct(r.top.spent, r.top.prev) }) },
      { title: t("m3Title"), figure: r.biggest ? money(r.biggest.amount) : undefined, text: r.biggest
        ? t("m3", { description: r.biggest.description, amount: money(r.biggest.amount), date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${r.biggest.date}T12:00:00`)) })
        : t("m2None") },
      quiet,
      improved,
      { title: t("m6Title"), figure: r.trim ? money(r.trim.yearly) : undefined, text: r.trim ? t("m6", { name: cat(r.trim.name), yearly: money(r.trim.yearly) }) : t("m6None") },
      { title: t("closeTitle"), text: t("m7") },
    ];
  }

  function yearCards(r: YearRecap): StoryCard[] {
    return [
      { title: t("y1Title"), figure: money(r.spent), text: r.kept >= 0 ? t("y1", { year: r.year, spent: money(r.spent), kept: money(r.kept) }) : t("y1Over", { year: r.year, spent: money(r.spent), amount: money(-r.kept) }) },
      { title: t("y2Title"), figure: r.savingsRate != null ? `${Math.round(r.savingsRate * 100)}%` : undefined, text: r.savingsRate != null ? t("y2", { rate: Math.round(r.savingsRate * 100) }) : t("y2None") },
      { title: t("y3Title"), text: r.top.length ? r.top.map((c, i) => `${i + 1}. ${cat(c.name)} · ${money(c.spent)}`).join("\n") : t("m2None") },
      { title: t("y4Title"), figure: r.bestMonth ? money(r.bestMonth.kept) : undefined, text: r.bestMonth ? t("y4", { month: monthName(r.bestMonth.month), kept: money(r.bestMonth.kept) }) : t("m2None") },
      { title: t("y5Title"), figure: String(r.noSpendDays), text: t("y5", { days: r.noSpendDays }) },
      { title: t("closeTitle"), text: t("y6") },
    ];
  }

  const go = (to: number) => setIndex(Math.max(0, Math.min(total - 1, to)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || el?.closest("input, select, textarea, [role=radiogroup], [role=dialog]")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // In RTL the next card sits to the left.
      const forward = (e.key === "ArrowLeft") === (document.documentElement.dir === "rtl");
      setIndex((i) => Math.max(0, Math.min(total - 1, i + (forward ? 1 : -1))));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const setUrl = (q: string) => { setIndex(0); router.replace(`/recap${q}`, { scroll: false }); };
  const viewYear = year ?? Number(month.slice(0, 4));
  const activePeriod = periods.find((p) => p.key === month);
  const monthLabel = activePeriod ? periodLabel(activePeriod.from, activePeriod.to, activePeriod.key) : monthName(month);
  const card = cards[at];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {year ? (
          <Link href="/recap" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t("monthLink")}</Link>
        ) : (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t("monthLabel")}
            {/* The options are long; the select shrinks to the row instead of widening the page. */}
            <select value={month} onChange={(e) => setUrl(`?month=${e.target.value}`)} className="min-h-11 max-w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              {periods.map((p) => <option key={p.key} value={p.key}>{periodLabel(p.from, p.to, p.key)}</option>)}
            </select>
          </label>
        )}
        <Link href={`/recap?year=${viewYear}`} onClick={() => setIndex(0)} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t("yearLink", { year: viewYear })}</Link>
      </div>

      {query.isPending ? <Skeleton className="h-80 w-full rounded-3xl" />
        : query.isError ? <p role="alert" className="rounded-3xl border border-border p-8 text-center text-muted-foreground">{t("loadFailed")}</p>
        : !card ? null : (
        <section aria-roledescription={t("carousel")} aria-label={year ? t("yearTitle", { year }) : monthLabel}>
          <div
            key={`${year ?? month}-${at}`}
            role="group"
            aria-roledescription={t("slide")}
            aria-label={t("cardOf", { n: at + 1, total })}
            aria-live="polite"
            className="wallet flex min-h-80 flex-col justify-between rounded-3xl border border-white/10 p-6 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 sm:p-10"
          >
            <h2 className="text-footnote font-semibold text-muted-foreground">{card.title}</h2>
            {card.figure && <p className="figure my-6 text-5xl tabular-nums sm:text-6xl"><bdi>{card.figure}</bdi></p>}
            <p className="whitespace-pre-line text-xl font-semibold leading-relaxed text-pretty sm:text-2xl">{card.text}</p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" size="lg" onClick={() => go(at - 1)} disabled={at === 0} className="gap-1 px-2 font-semibold sm:px-4">
              <Back />{t("prev")}
            </Button>
            <div className="flex min-w-0 flex-wrap items-center justify-center sm:gap-1">
              {cards.map((c, i) => (
                <button key={c.title + i} type="button" onClick={() => go(i)} aria-label={t("goTo", { n: i + 1, title: c.title })} aria-current={i === at ? "step" : undefined}
                  className="grid size-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring">
                  <span className={cn("block size-2 rounded-full bg-muted-foreground/40", i === at && "w-5 bg-foreground")} aria-hidden />
                </button>
              ))}
            </div>
            <Button variant="ghost" size="lg" onClick={() => go(at + 1)} disabled={at === total - 1} className="gap-1 px-2 font-semibold sm:px-4">
              {t("next")}<Forward />
            </Button>
          </div>

          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => saveCardAsPng(card, locale === "he", `penny-${year ?? month}-${at + 1}.png`).catch(() => toast.error(t("saveFailed")))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <Download className="size-4" aria-hidden />{t("save")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
