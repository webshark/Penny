"use client";

import { usePlan } from "@/hooks/use-plan";
import { useGentle } from "@/hooks/use-gentle";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motionReduced } from "@/lib/a11y-prefs";
import { Printer, RotateCw } from "lucide-react";
import { getOverview, listIntegrations } from "@/lib/api";
import { CardShell } from "@/components/home/card-shell";
import { CategoryIcon } from "@/components/ui/category-icon";
import { HealthCard } from "@/components/home/health-card";
import { More } from "@/components/overview/more";
import { AllocationCard } from "@/components/overview/allocation-card";
import { MoneyFlowCard } from "@/components/overview/money-flow-card";
import { NetWorthDriversCard } from "@/components/overview/net-worth-drivers-card";
import { SpendChangeCard } from "@/components/overview/spend-change-card";
import { CategoryDonut, CategoryOverTime } from "@/components/overview/category-charts";
import { PeriodHero } from "@/components/ui/page-hero";
import { PagerNav } from "@/components/ui/month-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { DataState } from "@/components/ui/data-state";
import { Segmented } from "@/components/ui/segmented";
import { IconButton } from "@/components/ui/icon-button";
import { InfoTip } from "@/components/ui/info-tip";
import { translateCategoryName } from "@/lib/i18n-data";
import { cn } from "@/lib/utils";
import type { PeriodKind } from "@/lib/period";
import type { CostType, OverviewPayload } from "@/lib/types";

const KINDS: PeriodKind[] = ["month", "quarter", "half", "year"];
const COST_COLORS: Record<CostType, string> = { fixed: "var(--chart-1)", variable: "var(--chart-4)", unplanned: "var(--chart-5)" };

const fmt = (n: number, locale: string) =>
  Math.round(n).toLocaleString(locale === "he" ? "he-IL" : "en-US");
// LTR isolate keeps the sign in front of the amount inside Hebrew text.
const shekels = (n: number, locale: string) => `⁦${n < 0 ? "−" : ""}₪${fmt(Math.abs(n), locale)}⁩`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function OverviewView() {
  const t = useTranslations("overview");
  const [kind, setKindState] = useState<PeriodKind>("quarter");
  // Come back to the period you were looking at.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("overview-period") as PeriodKind | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (saved && KINDS.includes(saved)) setKindState(saved);
    } catch {}
  }, []);
  const setKind = (k: PeriodKind) => {
    setKindState(k);
    try {
      localStorage.setItem("overview-period", k);
    } catch {}
  };
  const [offset, setOffset] = useState(0);
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: listIntegrations });
  const query = useQuery({
    queryKey: ["overview", kind, offset],
    queryFn: () => getOverview(kind, offset),
  });
  // The period before: its arrow is disabled when it has no data.
  const older = useQuery({ queryKey: ["overview", kind, offset + 1], queryFn: () => getOverview(kind, offset + 1) });
  const olderEmpty = older.data != null && older.data.totals.income === 0 && older.data.totals.expenses === 0;
  const locale = useLocale();
  const d = query.data;
  // The card's foot: income, spending and what stayed, as one comparison rather than three cards.
  const stats = d
    ? [
        { key: "income", label: t("income"), dot: "var(--ring-income)", value: shekels(d.totals.income, locale), hint: <Delta cur={d.totals.income} base={d.previous.income} goodWhenUp label={t("vsPrevShort")} /> },
        { key: "expenses", label: t("expenses"), dot: "var(--ring-spending)", value: shekels(d.totals.expenses, locale), hint: <Delta cur={d.totals.expenses} base={d.previous.expenses} label={t("vsPrevShort")} /> },
        { key: "saved", label: t("leftOver"), dot: "var(--ring-savings)", value: shekels(d.totals.net, locale), hint: d.totals.savingsRate != null ? t("ofIncome", { percent: pct(d.totals.savingsRate) }) : t("noIncome") },
      ]
    : undefined;

  return (
    <div className="space-y-4 md:space-y-6">
      <PeriodHero totals={query.data?.totals} stats={stats} loading={!query.data && !query.isError} error={query.isError} onRetry={() => query.refetch()}
        nav={<PagerNav label={query.data ? <PeriodLabel period={query.data.period} /> : "…"} ariaLabel={t("periodPicker")} prevLabel={t("prev")} nextLabel={t("next")}
          onPrev={() => setOffset((o) => o + 1)} onNext={() => setOffset((o) => Math.max(0, o - 1))} prevDisabled={olderEmpty} nextDisabled={offset === 0} />} />
      {query.data && (
        <div className="hidden print:block">
          <p className="text-title font-semibold">{t("reportTitle")} · <PeriodLabel period={query.data.period} /></p>
          <p className="text-caption">{t("reportGenerated", { date: new Date().toLocaleDateString() })}</p>
        </div>
      )}
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t("periodPicker")}
          value={kind}
          options={KINDS.map((k) => ({ value: k, label: t(`period_${k}`) }))}
          onChange={(k) => {
            setKind(k);
            setOffset(0);
          }}
        />
        <IconButton label={t("print")} variant="ghost" onClick={() => window.print()} disabled={!query.data}>
          <Printer className="size-4" aria-hidden />
        </IconButton>
      </div>

      {query.isError ? (
        <CardShell>
          <p className="text-footnote text-muted-foreground">{t("error")}</p>
          <IconButton showLabel label={t("retry")} variant="outline" className="mt-3 self-start" onClick={() => query.refetch()}>
            <RotateCw className="size-4" aria-hidden />
          </IconButton>
        </CardShell>
      ) : !query.data ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          <Skeleton className="h-64 rounded-2xl md:col-span-4" />
        </div>
      ) : query.data.totals.income === 0 && query.data.totals.expenses === 0 ? (
        <DataState period={integrations.data?.some((bank) => Boolean(bank.lastSyncAt)) ?? false} />
      ) : (
        <Body data={query.data} />
      )}
    </div>
  );
}

function PeriodLabel({ period }: { period: OverviewPayload["period"] }) {
  const t = useTranslations("overview");
  const locale = useLocale();
  const n = Math.floor((period.startMonth - 1) / (period.kind === "half" ? 6 : 3)) + 1;
  const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(period.year, period.startMonth - 1, 1));
  return <>{t(`label_${period.kind}`, { month, year: period.year, n })}</>;
}

function Body({ data }: { data: OverviewPayload }) {
  const t = useTranslations("overview");
  const locale = useLocale();
  const empty = data.totals.income === 0 && data.totals.expenses === 0;
  const simple = usePlan().plan.simpleMode;
  // Future and not-yet-synced months would drag the average down.
  // Months with any activity, so the 50/30/20 card works on an average month.
  const months = Math.max(1, data.monthly.filter((m) => m.expenses > 0 || m.income > 0).length);
  const avgMonthly = data.totals.expenses / Math.max(1, data.monthly.filter((m) => m.expenses > 0).length);

  return (
    <>

      {empty ? (
        <CardShell><p className="text-footnote text-muted-foreground">{t("empty")}</p></CardShell>
      ) : (
        <>
          <MoneyFlowCard data={data} />
          <SpendChangeCard />
          <div className="grid gap-4 md:gap-6 xl:grid-cols-2 xl:items-start [&>*:only-child]:col-span-full">
            {data.monthly.length > 1 && <FlowChart monthly={data.monthly} />}
            <NetWorthDriversCard data={data} />
          </div>
          {data.categories.length > 0 && <CategoryList data={data} />}
          <CategoryOverTime data={data} />

          <div className="grid gap-4 md:gap-6 xl:grid-cols-2 xl:items-start [&>*:only-child]:col-span-full">
            <AllocationCard income={data.totals.income / months} expenses={avgMonthly} byNeed={{ need: data.byNeed.need / months, want: data.byNeed.want / months, saving: data.byNeed.saving / months }} fixed={data.byCost.fixed / months} uncategorized={data.uncategorized / months} categories={data.categories} />
          <HealthCard details={false} />
          </div>
          {!simple && (
            <More id="period">
              <SplitCard
                title={t("costTitle")}
                parts={(["fixed", "variable", "unplanned"] as const).map((k) => ({ key: k, label: t(k), value: data.byCost[k], color: COST_COLORS[k] }))}
                uncategorized={data.uncategorized}
              />
              {data.period.months.length > 1 && <YearTable data={data} />}
              <p className="flex items-center gap-1 px-1 text-footnote font-medium">
                {t("lifeCost", { amount: fmt(avgMonthly * 300, locale) })}
                <InfoTip text={t("lifeCostHint")} />
              </p>
            </More>
          )}
        </>
      )}
    </>
  );
}

function Delta({ cur, base, goodWhenUp, label }: { cur: number; base: number; goodWhenUp?: boolean; label: string }) {
  // Gentle mode: no comparisons with earlier periods.
  if (useGentle() || base === 0) return null;
  const change = (cur - base) / Math.abs(base);
  const good = goodWhenUp ? change >= 0 : change <= 0;
  return (
    <span className="flex items-baseline gap-1.5 text-caption">
      <span className={cn("font-semibold tabular-nums", good ? "text-status-on-track" : "text-status-over")} dir="ltr">
        {change >= 0 ? "+" : "−"}{pct(Math.abs(change))}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function FlowChart({ monthly }: { monthly: OverviewPayload["monthly"] }) {
  const t = useTranslations("overview");
  const locale = useLocale();
  const rtl = locale === "he";
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${key}-15T12:00:00`));

  return (
    <CardShell
      label={t("cashFlowTitle")}
      action={
        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-caption text-muted-foreground">
          <Legend color="var(--flow-income)" label={t("income")} />
          <Legend color="var(--flow-expense)" label={t("expenses")} />
          <Legend color="var(--primary)" label={t("netTrend")} />
        </span>
      }
    >
      {/* Cash-flow chart: income above the line, spending below, and the net as a trend line.
          Time runs right to left in Hebrew, like the rest of the page. */}
      <ul className="sr-only" aria-label={t("cashFlowChart")}>
        {monthly.map((m) => (
          <li key={m.month}>{monthLabel(m.month)}: {t("income")} {shekels(m.income, locale)}, {t("expenses")} {shekels(m.expenses, locale)}, {t(m.income - m.expenses >= 0 ? "netUp" : "netDown")} {shekels(Math.abs(m.income - m.expenses), locale)}</li>
        ))}
      </ul>
      <div className="h-56" dir="ltr" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={monthly.map((m) => ({ label: monthLabel(m.month), income: m.income, expenses: -m.expenses, net: m.income - m.expenses }))} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" reversed={rtl} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis orientation={rtl ? "right" : "left"} tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip formatter={(v, name) => [shekels(Math.abs(Number(v)), locale), name]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} cursor={{ fill: "var(--accent)" }} />
            <Bar dataKey="income" name={t("income")} stackId="f" fill="var(--flow-income)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={!motionReduced()} />
            <Bar dataKey="expenses" name={t("expenses")} stackId="f" fill="var(--flow-expense)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={!motionReduced()} />
            <Line dataKey="net" name={t("netTrend")} type="monotone" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={!motionReduced()} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  );
}

function SplitCard({
  title, parts, uncategorized,
}: {
  title: string;
  parts: { key: string; label: string; value: number; color: string }[];
  uncategorized: number;
}) {
  const t = useTranslations("overview");
  const locale = useLocale();
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <CardShell label={title}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {parts.map((p) =>
          p.value > 0 ? <span key={p.key} style={{ width: `${(p.value / Math.max(total, 1)) * 100}%`, backgroundColor: p.color }} /> : null
        )}
      </div>
      <ul className="row-grid mt-4">
        {parts.map((p) => (
          <li key={p.key} className="flex items-baseline justify-between gap-3 py-2 text-footnote">
            <Legend color={p.color} label={p.label} />
            <span className="tabular-nums">
              <span className="font-semibold">{total ? pct(p.value / total) : "—"}</span>
              <span className="ms-2 text-muted-foreground">{shekels(p.value, locale)}</span>
            </span>
          </li>
        ))}
      </ul>
      {uncategorized > 0 && (
        <p className="mt-3 text-caption text-muted-foreground">{t("uncategorized", { amount: fmt(uncategorized, locale) })}</p>
      )}
    </CardShell>
  );
}

function CategoryList({ data }: { data: OverviewPayload }) {
  const t = useTranslations("overview");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const total = data.categories.reduce((s, c) => s + c.spent, 0);

  return (
    <CardShell label={t("categoriesTitle")}>
      {/* Breakdown: the donut beside the list. */}
      <div className="grid items-center gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <CategoryDonut data={data} />
      <ul className="row-grid">
        {data.categories.map((c) => {
          return (
            <li key={c.categoryId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3.5">
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-footnote font-medium">{translateCategoryName(c.name, tCat)}</span>
                  <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{total ? pct(c.spent / total) : ""}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${total ? (c.spent / total) * 100 : 0}%`, backgroundColor: c.color }} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3">
                  <Delta cur={c.spent} base={c.previous} label={t("vsPrevShort")} />
                  <Delta cur={c.spent} base={c.lastYear} label={t("vsLyShort")} />
                </div>
              </div>
              {/* Fixed minimum width so every row's bar ends at the same place. */}
              <span className="min-w-20 text-end text-footnote font-semibold tabular-nums">{shekels(c.spent, locale)}</span>
            </li>
          );
        })}
      </ul>
      </div>
    </CardShell>
  );
}

function YearTable({ data }: { data: OverviewPayload }) {
  const t = useTranslations("overview");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${key}-15T12:00:00`));
  const colTotal = (m: string) => data.categories.reduce((s, c) => s + (c.monthly[m] ?? 0), 0);

  return (
    <CardShell label={t("tableTitle")} className="p-0 md:p-0">
      <div className="overflow-x-auto px-5 pb-5 md:px-6 md:pb-6" tabIndex={0} role="region" aria-label={t("tableCaption")}>
        <table className="w-full min-w-max text-footnote tabular-nums">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead>
            <tr className="text-caption text-muted-foreground">
              <th scope="col" className="sticky start-0 bg-card py-2 pe-4 text-start font-medium">{t("category")}</th>
              {data.period.months.map((m) => (
                <th key={m} scope="col" className="px-2 py-2 text-end font-medium">{monthLabel(m)}</th>
              ))}
              <th scope="col" className="ps-3 py-2 text-end font-semibold text-foreground">{t("total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.categories.map((c) => (
              <tr key={c.categoryId}>
                <th scope="row" className="sticky start-0 bg-card py-2 pe-4 text-start font-medium">
                  <span className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                    {translateCategoryName(c.name, tCat)}
                  </span>
                </th>
                {data.period.months.map((m) => (
                  <td key={m} className={cn("px-2 py-2 text-end", !c.monthly[m] && "text-muted-foreground")}>
                    {c.monthly[m] ? fmt(c.monthly[m], locale) : "–"}
                  </td>
                ))}
                <td className="ps-3 py-2 text-end font-semibold">{fmt(c.spent, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <th scope="row" className="sticky start-0 bg-card py-2 pe-4 text-start">{t("total")}</th>
              {data.period.months.map((m) => (
                <td key={m} className="px-2 py-2 text-end">{fmt(colTotal(m), locale)}</td>
              ))}
              <td className="ps-3 py-2 text-end">{fmt(data.categories.reduce((s, c) => s + c.spent, 0), locale)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </CardShell>
  );
}
