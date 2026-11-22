"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { shekels } from "@/lib/money";
import { CircleDot } from "lucide-react";
import { ICON_MAP } from "@/components/dashboard/category-card";
import { translateCategoryName } from "@/lib/i18n-data";
import { Sparkline } from "@/components/ui/sparkline";
import type { HomeCategoryBlock } from "@/lib/types";


/** One block per category, each with a header that sticks under the page header while its block scrolls by. */
export function CategoryScroll({ items }: { items: HomeCategoryBlock[] }) {
  const t = useTranslations("home");

  return (
    <section aria-labelledby="category-scroll-title">
      <div className="mb-3 px-1">
        <h2 id="category-scroll-title" className="text-title font-semibold">{t("categoriesTitle")}</h2>
        <p className="text-footnote text-muted-foreground">{t("categoriesSubtitle")}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-footnote text-muted-foreground">
          {t("noCategoriesYet")}
        </p>
      ) : (
        <ol className="space-y-3">
          {items.map((c) => (
            <CategoryBlock key={c.categoryId} item={c} />
          ))}
        </ol>
      )}
    </section>
  );
}

function CategoryBlock({ item }: { item: HomeCategoryBlock }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const name = translateCategoryName(item.name, tCat);
  const Icon = ICON_MAP[item.icon ?? "circle-dot"] ?? CircleDot;
  const hasBudget = item.budget > 0;
  const pct = hasBudget ? (item.spent / item.budget) * 100 : 0;
  const isOver = hasBudget && pct > 100;
  const headingId = `cat-${item.categoryId}`;

  const previous = item.trend.slice(0, -1).filter((v) => v > 0);
  const avg = previous.length ? previous.reduce((s, v) => s + v, 0) / previous.length : 0;

  return (
    <li
      aria-labelledby={headingId}
      className="snap-start scroll-mt-16 rounded-2xl bg-card md:scroll-mt-20"
    >
      <Link
        href={`/transactions?category=${item.categoryId}`}
        className="glass sticky top-14 z-10 flex items-center gap-3 rounded-t-2xl border-b border-border px-4 py-3 md:top-16 md:px-5"
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklab, ${item.color} 22%, transparent)` }}
          aria-hidden
        >
          <Icon className="size-[18px] text-foreground" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          <h3 id={headingId} className="truncate text-headline font-semibold">{name}</h3>
        </span>
        <span className="shrink-0 text-end tabular-nums">
          <span className="block text-headline font-semibold">{shekels(item.spent, locale)}</span>
          <span className="block text-caption text-muted-foreground">
            {hasBudget ? t("ofBudget", { budget: shekels(item.budget, locale) }) : t("noBudgetSet")}
          </span>
        </span>
      </Link>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 md:px-5">
        <div className="min-w-0 space-y-3">
          {hasBudget && (
            <div className="space-y-1.5">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(pct, 100))}
                aria-label={name}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: isOver ? "var(--status-over)" : item.color,
                  }}
                />
              </div>
              <p className={`text-footnote tabular-nums ${isOver ? "text-[var(--status-over)]" : "text-muted-foreground"}`}>
                {isOver
                  ? t("overBudgetBy", { amount: shekels(item.spent - item.budget, locale) })
                  : t("leftInBudget", { amount: shekels(item.budget - item.spent, locale) })}
              </p>
            </div>
          )}
          <div className="flex items-end gap-3">
            <Sparkline values={item.trend} color={item.color} label={t("trendLabel")} />
            <p className="min-w-0 text-footnote text-muted-foreground">
              {avg > 0 ? t("trendVsAverage", { percent: Math.round((item.spent / avg) * 100) }) : t("trendNoHistory")}
            </p>
          </div>
        </div>

        {item.topMerchants.length > 0 && (
          <div className="min-w-0">
            <p className="mb-1.5 text-caption font-medium text-muted-foreground">{t("topMerchantsIn")}</p>
            <ul className="divide-y divide-border">
              {item.topMerchants.map((m) => (
                <li key={m.merchant} className="flex items-baseline justify-between gap-3 py-1.5 text-footnote">
                  <span className="min-w-0 truncate">{m.merchant}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{shekels(m.amount, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}
