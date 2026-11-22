"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { getBalanceForecast, getOverdraft } from "@/lib/api";
import { monthlyToClear, overdraftDepth, shouldShowOverdraft } from "@/lib/overdraft";
import { shekels } from "@/lib/money";

/** What the overdraft costs, and a calm way out. Shown only when interest was paid or the forecast dips below zero. */
export function OverdraftCard({ subscriptionsMonthly }: { subscriptionsMonthly: number }) {
  const t = useTranslations("overdraft");
  const locale = useLocale();
  const money = (n: number) => shekels(Math.round(n), locale);
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const cost = useQuery({ queryKey: ["overdraft"], queryFn: getOverdraft });
  const forecast = useQuery({ queryKey: ["balance-forecast"], queryFn: getBalanceForecast });
  if (!cost.data || forecast.isPending) return null;
  const low = forecast.data?.forecast?.low.balance ?? null;
  if (!shouldShowOverdraft(cost.data, low)) return null;
  const depth = overdraftDepth(cost.data.balance, low);
  const monthly = monthlyToClear(depth, months);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">{t("yearlyInterest")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{money(cost.data.yearlyInterest)}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">{t("monthsIn")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{t("monthsValue", { count: cost.data.monthsInOverdraft })}</dd>
          </div>
        </dl>
        {low != null && low < 0 && <p className="text-sm leading-relaxed text-muted-foreground">{t("forecastDips", { amount: money(-low) })}</p>}

        <div className="grid gap-3">
          <h3 className="text-base font-semibold">{t("planTitle")}</h3>
          {depth > 0 ? (
            <>
              <Segmented
                label={t("monthsLabel")}
                value={months}
                onChange={setMonths}
                options={[3, 6, 12].map((m) => ({ value: m as 3 | 6 | 12, label: t("monthsOption", { count: m }) }))}
              />
              <p className="text-base leading-relaxed">{t("monthly", { amount: money(monthly), months, depth: money(depth) })}</p>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">{t("notNow")}</p>
          )}
          <ol className="grid list-decimal gap-2 ps-5 text-sm leading-relaxed">
            <li>{t("stepSetAside")}</li>
            <li>{t("stepSavings")}</li>
            <li>
              {subscriptionsMonthly > 0 ? t("stepSubscriptions", { amount: money(subscriptionsMonthly) }) : t("stepSubscriptionsNone")}{" "}
              <a href="/recurring#subscriptions" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                {t("seeSubscriptions")}
              </a>
            </li>
            <li>{t("stepBank")}</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
