"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, Search, Tags } from "lucide-react";
import { getTagReport } from "@/lib/api";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import type { TagTotal } from "@/lib/tags";

type SortKey = "tag" | "count" | "to" | "total";

/** Transaction groups: one sortable, searchable table of every tagged event, its size, dates and net. */
export function GroupsTable() {
  const t = useTranslations("groupsTable");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "to", desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["tags"], queryFn: () => getTagReport() });
  const detail = useQuery({ queryKey: ["tags", open], queryFn: () => getTagReport(open!), enabled: open != null });
  const money = (n: number) => shekels(Math.round(n), locale);
  const day = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d.slice(0, 10)}T12:00:00`));

  const rows = (list.data?.tags ?? [])
    .filter((x) => x.tag.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const v = (x: TagTotal) => x[sort.key];
      const c = typeof v(a) === "number" ? (v(a) as number) - (v(b) as number) : String(v(a)).localeCompare(String(v(b)), locale);
      return sort.desc ? -c : c;
    });

  const head = (key: SortKey, className = "") => {
    const on = sort.key === key;
    const Arrow = sort.desc ? ArrowDown : ArrowUp;
    return (
      <th scope="col" aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${className}`}>
        <button type="button" onClick={() => setSort({ key, desc: on ? !sort.desc : key !== "tag" })} className="inline-flex min-h-8 items-center gap-1 rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {t(`col_${key}`)}{on && <Arrow className="size-3" aria-hidden />}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      {list.isError ? <p role="alert" className="text-sm">{t("failed")}</p>
        : !list.data ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
        : list.data.tags.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <Tags className="mx-auto mb-3 size-8 text-primary" aria-hidden />
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("emptyHint")}</p>
          </div>
        ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:outline-2 focus-within:outline-ring">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-start">{head("tag", "text-start")}{head("count", "text-start")}{head("to", "text-start")}{head("total", "text-end")}<th scope="col"><span className="sr-only">{t("details")}</span></th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((x) => (
                  <Fragment key={x.tag}>
                    <tr className="hover:bg-accent/40">
                      <td className="px-4 py-3"><Link href={`/transactions?tag=${encodeURIComponent(x.tag)}`} className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">#{x.tag}</Link></td>
                      <td className="px-4 py-3 text-muted-foreground">{t("count", { count: x.count })}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{x.from.slice(0, 10) === x.to.slice(0, 10) ? day(x.from) : `${day(x.from)} – ${day(x.to)}`}</td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums"><bdi data-money className={x.total > 0 ? "text-expense" : "text-status-on-track"}>{money(-x.total)}</bdi></td>
                      <td className="w-12 px-2 py-3">
                        <button type="button" aria-expanded={open === x.tag} aria-label={t("details")} onClick={() => setOpen(open === x.tag ? null : x.tag)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                          <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open === x.tag ? "rotate-180" : ""}`} aria-hidden />
                        </button>
                      </td>
                    </tr>
                    {/* Penny's touch: where the group's money went, by category, without leaving the table. */}
                    {open === x.tag && (
                      <tr><td colSpan={5} className="bg-background/40 px-4 py-3">
                        {!detail.data ? <p role="status" className="text-xs text-muted-foreground">{t("loading")}</p> : (
                          <ul className="row-grid text-sm">
                            {detail.data.breakdown.map((b) => (
                              <li key={b.category ?? ""} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 truncate">{b.category ? translateCategoryName(b.category, tCat) : t("uncategorized")}</span><bdi data-money className="tabular-nums">{money(b.total)}</bdi></li>
                            ))}
                          </ul>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{t("noMatch")}</p>}
        </section>
      )}
    </div>
  );
}
