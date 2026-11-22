"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { InfoTip } from "@/components/ui/info-tip";
import { CalendarClock, Flag, Landmark, LayoutGrid, PieChart, Repeat, RotateCw, Sprout, Target } from "lucide-react";
import { getAssets, getCashflowHealth, getPlan, getSuggestions } from "@/lib/api";
import { shekels } from "@/lib/money";
import { Sparkline } from "@/components/ui/sparkline";
import { StatStrip, type StatStripItem } from "@/components/ui/stat-strip";
import { MonthNav, MonthStrip } from "@/components/ui/month-nav";
import { usePathname } from "next/navigation";
import { usePlan } from "@/hooks/use-plan";
import { wantsExplanations } from "@/lib/plan";
import { pagePurposeKey } from "@/lib/orientation";

/** Purple summary card that opens a page: one big number, one short sentence. Same look as the budget overview. */
export function PageHero({ title, icon, meta, month, aside, label, value, sentence, stats, loading, error, onRetry, children, compact = false }: {
  title: string; icon: React.ReactNode; meta?: React.ReactNode; label?: React.ReactNode; value?: React.ReactNode; sentence?: React.ReactNode; children?: React.ReactNode;
  /** The page's numbers, as a hairline strip at the card's foot: one comparison instead of a card each. */
  stats?: StatStripItem[];
  /** The page's month ("YYYY-MM"): the hero shows ‹ month › in its top row and a 12-month strip at its foot. */
  month?: { value: string; onChange: (m: string) => void };
  /** Shown beside the hero's figure, at the end side (visual left in Hebrew); shrinks on phones. */
  aside?: React.ReactNode;
  loading?: boolean; error?: boolean; onRetry?: () => void;
  /** A slim header for pages whose content is a list (transactions): smaller figure, no month strip. */
  compact?: boolean;
}) {
  const t = useTranslations("pageHero");
  // The page title is hidden when a hero opens the page, so the page's "what is this for" (i) lives here.
  const tPurpose = useTranslations("purpose");
  const pathname = usePathname();
  const { plan } = usePlan();
  const key = wantsExplanations(plan) ? pagePurposeKey(pathname) : null;
  const purpose = key && tPurpose.has(key) ? tPurpose(key) : null;
  return <section className={`studio-overview page-hero${compact ? " page-hero-compact" : ""}`} aria-label={title} aria-busy={loading || undefined}>
    <div className="studio-overview-top"><span className="studio-eyebrow">{icon}{title}{purpose && <InfoTip text={purpose} className="-my-3 text-current hover:bg-white/10" />}</span>{month ? <MonthNav value={month.value} onChange={month.onChange} /> : meta && <span className="studio-month">{meta}</span>}</div>
    <div className="hero-with-aside"><div className="studio-balance page-hero-body">
      {error ? <><p>{t("error")}</p>{onRetry && <button type="button" className="studio-inline-link" onClick={onRetry}>{t("retry")}<RotateCw size={15} aria-hidden="true" /></button>}</>
      : loading ? <><p className="page-hero-skel" style={{ width: "30%" }} /><div className="page-hero-skel studio-amount" style={{ width: "55%" }} /><p className="page-hero-skel" style={{ width: "70%" }} /></>
      : <><p>{label}</p><div className="studio-amount figure"><bdi>{value}</bdi></div><p className="studio-budget-context">{sentence}</p>{children}</>}
    </div>{aside && <div className="hero-aside">{aside}</div>}</div>
    {stats && stats.length > 0 && <StatStrip tone="hero" items={stats} className="mt-5" />}
    {month && !compact && <MonthStrip value={month.value} onChange={month.onChange} />}
  </section>;
}

export function FutureHero() {
  const t = useTranslations("pageHero");
  const ti = useTranslations("investments");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const tot = q.data?.totals;
  const hist = q.data?.history ?? [];
  const first = hist[0];
  const change = tot && hist.length > 1 ? tot.netWorth - first.netWorth : null;
  const since = change != null && <><bdi className="font-semibold tabular-nums">{shekels(change, locale)}</bdi> {ti("sinceFirst", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${first.date}T12:00:00`)) })}</>;
  const fact = (key: string, label: string, v: number, title?: string): StatStripItem => ({
    key, label, title, value: <bdi>{shekels(v, locale)}</bdi>,
  });
  return <PageHero title={tn("future")} icon={<Flag size={15} aria-hidden="true" />} loading={q.isPending} error={q.isError} onRetry={() => q.refetch()}
    label={t("netWorth")} value={tot && shekels(tot.netWorth, locale)}
    sentence={tot && (q.data!.assets.length ? <>{t("futureSentence", { assets: shekels(tot.assets, locale), debts: shekels(tot.liabilities, locale) })}{since && <> · {since}</>}</> : t("futureEmpty"))}>
    {tot && q.data!.assets.length > 0 && <>
      {/* 0-1 points: no trend to draw, so the chart is hidden */}
      {hist.length > 1 && <Sparkline values={hist.map((h) => h.netWorth)} color="currentColor" label={`${ti("netWorthTrend")}: ${shekels(first.netWorth, locale)} → ${shekels(tot.netWorth, locale)}`} fitToRange className="mt-3 h-12 w-full opacity-70" />}
      <StatStrip
        tone="hero"
        columns={4}
        className="mt-4"
        items={[
          fact("assets", ti("totalAssets"), tot.assets),
          fact("liabilities", ti("totalLiabilities"), -tot.liabilities),
          fact("tax", ti("deferredTax"), -tot.deferredTax, ti("deferredTaxHint")),
          fact("liquid", ti("liquidNetWorth"), tot.liquidNetWorth, ti("liquidNetWorthHint")),
        ]}
      />
    </>}
  </PageHero>;
}

export function MoreHero({ aside }: { aside?: React.ReactNode }) {
  const t = useTranslations("pageHero");
  const tn = useTranslations("nav");
  const q = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions });
  const n = q.data?.suggestions.length ?? 0;
  return <PageHero title={tn("more")} icon={<LayoutGrid size={15} aria-hidden="true" />} loading={q.isPending} error={q.isError} onRetry={() => q.refetch()} aside={aside}
    label={t("moreLabel")} value={n} sentence={n ? t("moreSentence") : t("moreEmpty")} />;
}

type HeroState = { loading: boolean; error: boolean; onRetry: () => void };
const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

export function PeriodHero({ totals, nav, stats, ...s }: HeroState & { totals?: { income: number; expenses: number; net: number }; /** The period pager, shown in the hero's top row. */ nav?: React.ReactNode; stats?: StatStripItem[] }) {
  const t = useTranslations("pageHero");
  const ts = useTranslations("sections");
  const locale = useLocale();
  return <PageHero title={ts("summary")} icon={<PieChart size={15} aria-hidden="true" />} meta={nav} stats={stats} {...s}
    label={t("periodLabel")} value={totals && shekels(totals.net, locale)}
    sentence={totals && t("txSentence", { income: shekels(totals.income, locale), expense: shekels(totals.expenses, locale) })} />;
}

export function AheadHero({ forecast, ...s }: HeroState & { forecast?: { date: string; total: number }[] }) {
  const t = useTranslations("pageHero");
  const ts = useTranslations("sections");
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  const until = new Date(now + 30 * 864e5).toISOString().slice(0, 10);
  const soon = (forecast ?? []).filter((f) => f.date <= until);
  return <PageHero title={ts("ahead")} icon={<CalendarClock size={15} aria-hidden="true" />} {...s}
    label={t("aheadLabel")} value={shekels(soon.reduce((sum, f) => sum + f.total, 0), locale)}
    sentence={soon.length ? t("aheadSentence", { count: soon.length }) : t("aheadEmpty")} />;
}

export function RecurringHero({ monthly, count, ...s }: HeroState & { monthly: number; count: number }) {
  const t = useTranslations("pageHero");
  const ts = useTranslations("sections");
  const locale = useLocale();
  // Strip: a year of it, how many, and its share of an average month's income.
  const health = useQuery({ queryKey: ["cashflow-health"], queryFn: getCashflowHealth });
  const income = health.data?.avgIncome ?? 0;
  const stats: StatStripItem[] = count ? [
    { key: "year", label: t("recurringYear"), value: <bdi>{shekels(monthly * 12, locale)}</bdi> },
    { key: "count", label: t("recurringActive"), value: count },
    ...(income > 0 ? [{ key: "share", label: t("recurringShare"), value: pct(monthly / income) }] : []),
  ] : [];
  return <PageHero title={ts("recurring")} icon={<Repeat size={15} aria-hidden="true" />} {...s}
    label={t("recurringLabel")} value={shekels(monthly, locale)} stats={stats}
    sentence={count ? t("recurringSentence", { count }) : t("recurringEmpty")} />;
}

export function FiHero({ savings, target }: { savings: number; target: number }) {
  const t = useTranslations("pageHero");
  const ts = useTranslations("sections");
  const locale = useLocale();
  const ok = target > 0 && Number.isFinite(target);
  return <PageHero title={ts("fi")} icon={<Landmark size={15} aria-hidden="true" />}
    label={t("fiLabel")} value={ok ? pct(savings / target) : "—"}
    sentence={ok && t("fiSentence", { amount: shekels(savings, locale), target: shekels(target, locale) })} />;
}

export function GoalsHero() {
  const t = useTranslations("pageHero");
  const ts = useTranslations("sections");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const goals = q.data?.goals ?? [];
  const saved = goals.reduce((sum, g) => sum + g.savedAmount, 0);
  const target = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  return <PageHero title={ts("goals")} icon={<Target size={15} aria-hidden="true" />} loading={q.isPending} error={q.isError} onRetry={() => q.refetch()}
    label={t("goalsLabel")} value={target > 0 ? pct(saved / target) : "—"}
    sentence={goals.length ? t("goalsSentence", { saved: shekels(saved, locale), target: shekels(target, locale), count: goals.length }) : t("goalsEmpty")} />;
}

export function LifeHero({ stage, done, total, ...s }: HeroState & { stage?: string; done: number; total: number }) {
  const t = useTranslations("pageHero");
  const ts = useTranslations("sections");
  return <PageHero title={ts("life")} icon={<Sprout size={15} aria-hidden="true" />} {...s}
    label={t("lifeLabel")} value={stage ?? "—"}
    sentence={stage ? t("lifeSentence", { done, total }) : t("lifeEmpty")} />;
}
