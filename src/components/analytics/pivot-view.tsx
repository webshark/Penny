"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { getPivot } from "@/lib/api";
import { pivotTotals, type PivotRow } from "@/lib/pivot";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import { Segmented } from "@/components/ui/segmented";
import { DataState } from "@/components/ui/data-state";

const RANGES = [3, 6, 12] as const;

/**
 * Spending by group (rows) and month (columns), with each row's total and monthly average.
 * Cells are shaded by size within their row, so a month that stands out is seen before it is read;
 * a group opens to its categories, and a cell opens that month's transactions.
 */
export function PivotView() {
  const t = useTranslations("pivot");
  const tCat = useTranslations("categoriesSeeded");
  const tBoard = useTranslations("board");
  const locale = useLocale();
  const [months, setMonths] = useState<(typeof RANGES)[number]>(6);
  const [open, setOpen] = useState<number[]>([]);
  const q = useQuery({ queryKey: ["pivot", months], queryFn: () => getPivot(months) });
  if (q.isError) return <DataState error onRetry={() => void q.refetch()} />;
  if (!q.data) return <DataState loading />;
  // A row that nets to nothing (refunds that cancel out) says nothing; leave it out.
  const rows = q.data.rows.filter((r) => r.amounts.some((a) => Math.round(a) !== 0));
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(new Date(`${m}-01T12:00:00`));
  const money = (n: number) => (n ? shekels(Math.round(n), locale) : "–");
  const totals = pivotTotals(rows, q.data.months.length);
  const grand = totals.reduce((s, x) => s + x, 0);

  const line = (r: PivotRow, depth: 0 | 1) => {
    const max = Math.max(...r.amounts, 1);
    const isOpen = open.includes(r.id);
    const name = r.id === 0 ? tBoard("uncategorized") : translateCategoryName(r.name, tCat);
    return (
      <tr key={`${depth}-${r.id}`} className={depth ? "bg-muted/30" : "border-t border-border"}>
        <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-2 text-start font-normal">
          <span className={`flex items-center gap-2 ${depth ? "ps-7" : ""}`}>
            {depth === 0 && r.children.length > 0 ? (
              <button type="button" onClick={() => setOpen(isOpen ? open.filter((x) => x !== r.id) : [...open, r.id])} aria-expanded={isOpen}
                aria-label={t(isOpen ? "collapse" : "expand", { name })} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <ChevronDown className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "" : "-rotate-90 rtl:rotate-90"}`} aria-hidden />
              </button>
            ) : depth === 0 ? <span className="size-6" /> : null}
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className={`truncate ${depth ? "text-muted-foreground" : "font-medium"}`} title={name}>{name}</span>
          </span>
        </th>
        {r.amounts.map((a, i) => (
          <td key={i} className="p-0 text-end tabular-nums">
            <Link href={`/transactions?month=${q.data.months[i]}&category=${r.id}`} className="block px-3 py-2 hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              style={a > 0 ? { background: `color-mix(in oklab, var(--primary) ${Math.round((a / max) * 16)}%, transparent)` } : undefined}>
              <bdi data-money>{money(a)}</bdi>
            </Link>
          </td>
        ))}
        <td className="px-3 py-2 text-end font-semibold tabular-nums"><bdi data-money>{money(r.total)}</bdi></td>
        <td className="px-3 py-2 text-end tabular-nums text-muted-foreground"><bdi data-money>{money(r.average)}</bdi></td>
      </tr>
    );
  };

  return (
    <section aria-label={t("title")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <Segmented label={t("range")} value={String(months)} onChange={(v) => setMonths(Number(v) as (typeof RANGES)[number])}
          options={RANGES.map((n) => ({ value: String(n), label: t("months", { n }) }))} />
      </div>
      {rows.length === 0 ? <DataState period /> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="sticky start-0 z-10 bg-card px-3 py-2.5 text-start font-semibold">{t("category")}</th>
                {q.data.months.map((m) => <th key={m} scope="col" className="px-3 py-2.5 text-end font-semibold">{monthLabel(m)}</th>)}
                <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t("total")}</th>
                <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t("average")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <Fragment key={r.id}>{line(r, 0)}{open.includes(r.id) && r.children.map((c) => line(c, 1))}</Fragment>)}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-2.5 text-start">{t("total")}</th>
                {totals.map((x, i) => <td key={i} className="px-3 py-2.5 text-end tabular-nums"><bdi data-money>{money(x)}</bdi></td>)}
                <td className="px-3 py-2.5 text-end tabular-nums"><bdi data-money>{money(grand)}</bdi></td>
                <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground"><bdi data-money>{money(grand / q.data.months.length)}</bdi></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
