"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChartNoAxesColumnIncreasing, ChartPie, Table2 } from "lucide-react";
import { distributionCategories, type StudioPreferences } from "@/lib/budget-studio";
import { translateCategoryName } from "@/lib/i18n-data";
import { shekels } from "@/lib/money";
import type { CategoryWithData } from "@/lib/types";
import { useStudioCopy } from "./studio-copy";

export function StudioDistribution({ categories, uncategorized, chart, onChartChange }: { categories: CategoryWithData[]; uncategorized?: { spent: number; count: number }; chart: StudioPreferences["chart"]; onChartChange: (chart: StudioPreferences["chart"]) => void }) {
  const locale = useLocale();
  const c = useStudioCopy();
  const tCat = useTranslations("categoriesSeeded");
  // Uncategorized spend gets its own row: without it the shares here never add up to the month's total.
  const rows = [
    ...distributionCategories(categories).map((row) => ({
      key: String(row.categoryId),
      name: translateCategoryName(row.categoryName, tCat),
      color: row.categoryColor,
      spent: row.spent,
      href: null as string | null,
    })),
    ...(uncategorized && uncategorized.spent > 0
      ? [{ key: "uncategorized", name: c.noCategory, color: "#94a3b8", spent: uncategorized.spent, href: "/transactions?review=1" }]
      : []),
  ].sort((a, b) => b.spent - a.spent);
  const total = rows.reduce((sum, row) => sum + row.spent, 0);
  const ends = rows.map((_, i) => rows.slice(0, i + 1).reduce((sum, r) => sum + r.spent, 0) / total * 100);
  const segments = rows.map((row, i) => `${row.color} ${i ? ends[i - 1] : 0}% ${ends[i]}%`);
  return <section className="studio-overview studio-distribution" aria-labelledby="studio-distribution-title">
    <div className="studio-panel-heading"><div><h2 id="studio-distribution-title">{c.distribution}</h2><p>{c.distributionHint}</p></div><div className="studio-chart-switch" role="group" aria-label={c.chart}>
      {([['bars', ChartNoAxesColumnIncreasing], ['donut', ChartPie], ['table', Table2]] as const).map(([value, Icon]) => <button key={value} onClick={() => onChartChange(value)} aria-label={c[value]} title={c[value]} aria-pressed={chart === value}><Icon size={16} aria-hidden="true" /></button>)}
    </div></div>
    {!rows.length ? <p className="studio-empty">{c.noData}</p> : <>
      {chart === "donut" && <div className="studio-donut" style={{ background: `conic-gradient(${segments.join(",")})` }} aria-hidden="true"><div><span>{c.showChart}</span><strong data-money>{shekels(total, locale)}</strong></div></div>}
      {chart === "table" ? <table className="studio-table"><thead><tr><th>{c.category}</th><th>{c.amount}</th><th>{c.share}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.name}</th><td data-money>{shekels(row.spent, locale)}</td><td data-money>{Math.round(row.spent / total * 100)}%</td></tr>)}</tbody></table> : <ul className={`studio-bars ${chart === "donut" ? "studio-legend" : ""}`}>
        {rows.map((row) => {
          const body = <><div className="studio-bar-label"><span><i style={{ background: row.color }} />{row.name}</span><b data-money>{shekels(row.spent, locale)}<small>{Math.round(row.spent / total * 100)}%</small></b></div>{chart === "bars" && <div className="studio-bar-track" aria-hidden="true"><i style={{ width: `${row.spent / total * 100}%`, background: row.color }} /></div>}</>;
          return <li key={row.key}>{row.href ? <Link href={row.href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{body}</Link> : body}</li>;
        })}
      </ul>}
    </>}
  </section>;
}
