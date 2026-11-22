"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getAssets } from "@/lib/api";
import { shekels } from "@/lib/money";
import type { AssetType } from "@/lib/types";

const INVESTMENT_TYPES = new Set<AssetType>(["stock", "fund", "bond", "crypto", "metal", "study_fund", "provident", "pension"]);

/** Investments page: a card per holding with its value, gain since buying and cost basis. */
export function InvestmentCards() {
  const t = useTranslations("investments");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const holdings = (q.data?.assets ?? []).filter((a) => !a.isLiability && INVESTMENT_TYPES.has(a.type)).sort((a, b) => (b.valueIls ?? 0) - (a.valueIls ?? 0));
  if (holdings.length === 0) return null;
  const money = (n: number) => shekels(Math.round(n), locale);
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2, signDisplay: "always" });
  return (
    <ul aria-label={t("holdingsCards")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {holdings.map((a) => {
        const cost = a.valueIls != null && a.gainIls != null ? a.valueIls - a.gainIls : null;
        const up = (a.gainIls ?? 0) >= 0;
        const Trend = up ? TrendingUp : TrendingDown;
        return (
          <li key={a.id}>
            <Link href={`/accounts/${a.id}`} className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-sm font-semibold text-primary" aria-hidden>{a.symbol?.slice(0, 3) ?? a.name.slice(0, 2)}</span>
                <span className="min-w-0"><span className="block truncate font-semibold" title={a.name}>{a.name}</span><span className="block truncate text-xs text-muted-foreground">{t(`type_${a.type}`)}</span></span>
              </span>
              <bdi data-money className="mt-4 block text-2xl font-semibold tabular-nums">{a.valueIls == null ? "—" : money(a.valueIls)}</bdi>
              {a.gainIls != null && cost ? (
                <span className={`mt-0.5 flex items-center gap-1 text-sm tabular-nums ${up ? "text-status-on-track" : "text-expense"}`}>
                  <Trend className="size-3.5" aria-hidden /><bdi data-money>{money(a.gainIls)}</bdi><bdi className="text-xs opacity-80">({pct.format(a.gainIls / cost)})</bdi>
                </span>
              ) : null}
              {cost != null && <span className="mt-1 text-xs text-muted-foreground">{t("costBasisLine", { amount: money(cost) })}</span>}
              {a.note && <span className="mt-3 line-clamp-2 text-xs text-muted-foreground">{a.note}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
