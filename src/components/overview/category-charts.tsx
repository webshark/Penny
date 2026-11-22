"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motionReduced } from "@/lib/a11y-prefs";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import { CardShell } from "@/components/home/card-shell";
import type { OverviewPayload } from "@/lib/types";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" };

/** Category donut, shown beside the category list: the period's spending by category. */
export function CategoryDonut({ data }: { data: OverviewPayload }) {
  const t = useTranslations("overview");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const rows = data.categories.filter((c) => c.spent > 0);
  const total = rows.reduce((s, c) => s + c.spent, 0);
  if (total === 0) return null;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-64" role="img" aria-label={t("donutLabel", { total: shekels(Math.round(total), locale) })}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows.map((c) => ({ name: translateCategoryName(c.name, tCat), value: c.spent, fill: c.color }))} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={1.5} stroke="none" isAnimationActive={!motionReduced()} />
          <Tooltip formatter={(v) => shekels(Math.round(Number(v)), locale)} contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <span className="text-xs text-muted-foreground">{t("total")}</span>
        <bdi data-money className="text-xl font-semibold tabular-nums">{shekels(Math.round(total), locale)}</bdi>
      </div>
    </div>
  );
}

/** "over time": each month's spending stacked by category, with the change from the month before. */
export function CategoryOverTime({ data }: { data: OverviewPayload }) {
  const t = useTranslations("overview");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const months = data.period.months.filter((m) => data.categories.some((c) => (c.monthly[m] ?? 0) > 0));
  if (months.length < 2) return null;
  // The six biggest categories get their own colour; the rest share one "other" band.
  const top = [...data.categories].sort((a, b) => b.spent - a.spent).slice(0, 6);
  const topIds = new Set(top.map((c) => c.categoryId));
  const label = (m: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${m}-15T12:00:00`));
  const rows = months.map((m, i) => {
    const row: Record<string, number | string> = { month: label(m) };
    let sum = 0;
    for (const c of data.categories) {
      const v = c.monthly[m] ?? 0;
      sum += v;
      const key = topIds.has(c.categoryId) ? `c${c.categoryId}` : "other";
      row[key] = ((row[key] as number) ?? 0) + v;
    }
    const prev = i > 0 ? data.categories.reduce((s, c) => s + (c.monthly[months[i - 1]] ?? 0), 0) : 0;
    row.total = sum;
    row.change = prev ? Math.round(((sum - prev) / prev) * 100) : 0;
    return row;
  });
  const series = [...top.map((c) => ({ key: `c${c.categoryId}`, name: translateCategoryName(c.name, tCat), color: c.color })), { key: "other", name: t("otherCategories"), color: "var(--muted-foreground)" }];
  return (
    <CardShell label={t("overTimeTitle")}>
      <div className="h-64" dir="ltr" role="img" aria-label={t("overTimeLabel", { from: label(months[0]), to: label(months[months.length - 1]) })}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} maxBarSize={56}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v, name) => [shekels(Math.round(Number(v)), locale), name]} contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="m" fill={s.color} isAnimationActive={!motionReduced()} radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}>
                {/* The month-over-month change rides on top of each stack. */}
                {i === series.length - 1 && <LabelList dataKey="change" position="top" fontSize={10} fill="var(--muted-foreground)" formatter={(v: unknown) => (Number(v) ? `${Number(v) > 0 ? "+" : ""}${v}%` : "")} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.name}</li>)}
      </ul>
    </CardShell>
  );
}
