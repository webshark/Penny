"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CardShell } from "@/components/home/card-shell";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAssets } from "@/lib/api";
import { usePlan } from "@/hooks/use-plan";
import { allocate, liquidCash } from "@/lib/allocation";
import { Segmented } from "@/components/ui/segmented";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import type { NeedType, OverviewCategoryRow } from "@/lib/types";

const BUCKETS = ["need", "want", "saving"] as const;

/** One look per bucket, used by the bar, the legend and the category chips; the pattern tells them apart without color. */
const fill = (k: NeedType | "none"): CSSProperties => {
  if (k === "none") return { backgroundImage: "repeating-linear-gradient(45deg, var(--muted-foreground) 0 1.5px, transparent 1.5px 5px)" };
  const c = `var(--bucket-${k})`;
  const soft = `color-mix(in oklab, ${c} 45%, var(--card))`;
  if (k === "need") return { backgroundColor: c };
  if (k === "want") return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 3px, ${soft} 3px 5px)` };
  return { backgroundImage: `radial-gradient(circle, ${soft} 1px, transparent 1.5px), linear-gradient(${c}, ${c})`, backgroundSize: "4px 4px, auto" };
};

const Swatch = ({ k }: { k: NeedType | "none" }) => (
  <span className="size-3 shrink-0 rounded-[3px] border border-border" style={fill(k)} aria-hidden />
);

/** The 50/30/20 targets for the average month of this period, and where the surplus should go. */
export function AllocationCard({
  income, expenses, byNeed, fixed, uncategorized, categories,
}: {
  income: number;
  expenses: number;
  byNeed: Record<NeedType, number>;
  fixed: number;
  uncategorized: number;
  categories: OverviewCategoryRow[];
}) {
  const t = useTranslations("allocation");
  const tc = useTranslations("common");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  // The household plan's emergency-fund target (shared by every profile, same value Home and FI use).
  const { plan, update } = usePlan();
  const months = plan.emergencyMonths;
  const pickMonths = (v: string) => { void update({ emergencyMonths: Number(v) }).catch(() => toast.error(tc("saveFailed"))); };
  if (income <= 0) return null;
  const liquidNow = liquidCash(assets.data?.assets ?? []);
  const a = allocate({ income, expenses, liquidNow, emergencyMonths: months });
  const fixedShare = fixed / income;
  const $ = (n: number) => shekels(n, locale);
  const actual = (k: NeedType) => (k === "saving" ? Math.max(0, a.surplus) : byNeed[k]);
  const barTotal = Math.max(income, BUCKETS.reduce((s, k) => s + actual(k), 0) + uncategorized);

  const more = (
    <Popover>
      <PopoverTrigger aria-label={tc("moreInfo")} className="-my-3 inline-grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 text-footnote leading-relaxed">
        <p className="text-muted-foreground">{t("intro", { income: $(income), expenses: $(expenses) })}</p>
        <ul className="space-y-1.5">
          {BUCKETS.map((k) => {
            const cats = categories.filter((c) => (c.byNeed[k] ?? 0) > 0);
            return cats.length > 0 && (
              <li key={k} className="flex gap-2"><Swatch k={k} /><span><span className="font-medium">{t(`b_${k}`)}:</span> {cats.map((c) => translateCategoryName(c.name, tCat)).join(", ")}</span></li>
            );
          })}
          {uncategorized > 0 && (
            <li className="flex items-center gap-2">
              <Swatch k="none" />{t("unassigned")} <span className="font-semibold tabular-nums">{$(uncategorized)}</span>
              <Link href="/transactions" className="font-medium text-primary underline-offset-2 hover:underline">{t("categorize")}</Link>
            </li>
          )}
        </ul>
        <p className={fixedShare > 0.6 ? "text-status-heads-up" : "text-muted-foreground"}>{t(fixedShare > 0.6 ? "fixedHigh" : "fixed", { pct: Math.round(fixedShare * 100) })}</p>
        {a.surplus > 0 && (
          <div>
            <p className="font-semibold">{t("monthlyTitle", { amount: $(a.surplus) })}</p>
            <ul className="mt-1 space-y-1.5">
              {(["liquid", "moneyMarket", "market"] as const).map((k) => (
                <li key={k} className="flex items-baseline justify-between gap-3">
                  <span>{t(`to_${k}`)}<span className="block text-caption text-muted-foreground">{t(`why_${k}`)}</span></span>
                  <span className="font-semibold tabular-nums">{$(a.monthly[k])}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("emergencySize")}</span>
          <Segmented label={t("emergencySize")} value={String(months)} onChange={pickMonths} options={[{ value: "3", label: t("m3") }, { value: "6", label: t("m6") }]} />
        </div>
        <p>
          {t("emergency", { goal: $(a.hold.emergency), months, liquid: $(a.hold.liquid), mm: $(a.hold.moneyMarket) })}{" "}
          <span className="text-muted-foreground">
            {a.monthsToFull === 0 ? t("full") : a.monthsToFull == null ? t("never") : t("eta", { covered: a.coveredMonths.toFixed(1), n: a.monthsToFull })}
          </span>
        </p>
        <p className="text-caption text-muted-foreground">{t("info")}</p>
      </PopoverContent>
    </Popover>
  );

  return (
    <CardShell label={t("title")} action={more}>
      {/* The bar is the month's income; each bucket takes its share in its own color and pattern. */}
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
        {/* The thin bar stays flat color — at 10px the patterns read as noise; they live in the legend swatches. */}
        {BUCKETS.map((k) => actual(k) > 0 && <span key={k} style={{ width: `${(actual(k) / barTotal) * 100}%`, background: `var(--bucket-${k})` }} />)}
        {uncategorized > 0 && <span style={{ width: `${(uncategorized / barTotal) * 100}%`, background: "var(--muted-foreground)" }} />}
      </div>

      <ul className="mt-2 divide-y divide-border/70">
        {BUCKETS.map((k) => {
          const value = actual(k);
          const off = k === "saving" ? value < a.targets[k] : value > a.targets[k];
          return (
            <li key={k} className="flex items-baseline justify-between gap-3 py-1.5 text-caption">
              <span className="flex items-center gap-1.5 font-medium"><Swatch k={k} />{t(`b_${k}`)}</span>
              <span className={`text-end font-semibold tabular-nums ${off ? "text-status-heads-up" : ""}`}>
                {t("ofTarget", { actual: $(value), target: $(a.targets[k]) })}
                {off && <span className="sr-only"> ({t("offTarget")})</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-caption text-muted-foreground">{a.surplus > 0 ? t("leftover", { amount: $(a.surplus) }) : t("noSurplusShort")}</p>
    </CardShell>
  );
}
