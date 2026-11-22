"use client";

import { useQuery } from "@tanstack/react-query";
import { translateCategoryName } from "@/lib/i18n-data";
import { DataState } from "@/components/ui/data-state";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInsights, listIntegrations, type InsightsPayload } from "@/lib/api";
import { shekels } from "@/lib/money";
import { BalanceForecastCard } from "./balance-forecast-card";
import { AccountForecastCard } from "./account-forecast-card";
import { RecurringCalendar } from "./recurring-calendar";
import { OverdraftCard } from "./overdraft-card";
import { More } from "@/components/overview/more";
import { AheadHero, RecurringHero } from "@/components/ui/page-hero";
import { addDays, nthCharge } from "@/lib/balance-forecast";

const PER_MONTH = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 } as const;


/** One tab of the insights: what's coming ("ahead") or what repeats ("recurring"). */
export function InsightsView({ part }: { part: "ahead" | "recurring" }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const money = (n: number) => shekels(Math.round(n), locale);
  const tCat = useTranslations("categoriesSeeded");
  // The server keeps an English sentence for logs and the bot; the screen words each alert in the user's language.
  const anomalyText = (a: InsightsPayload["anomalies"][number]) =>
    a.type === "category_spike" && a.category && a.amount != null && a.usual != null
      ? t("anomalySpike", { category: translateCategoryName(a.category, tCat), amount: money(a.amount), usual: money(a.usual) })
      : a.type === "new_large_merchant" && a.merchant && a.amount != null
        ? t("anomalyNewMerchant", { merchant: a.merchant, amount: money(a.amount) })
        : a.type === "duplicate_charge" && a.merchant && a.amount != null
          ? t("anomalyDuplicate", { merchant: a.merchant, amount: money(a.amount), count: a.count ?? 2 })
          : a.detail;
  const query = useQuery({ queryKey: ["insights"], queryFn: getInsights });
  const banks = useQuery({ queryKey: ["integrations"], queryFn: listIntegrations });
  const data = query.data;
  const retry = () => { void query.refetch(); void banks.refetch(); };
  const state = { loading: !data || banks.isPending, error: query.isError || banks.isError, onRetry: retry };
  const fixed = data?.series.filter((s) => s.status !== "candidate") ?? [];
  const hero = part === "recurring"
    ? <RecurringHero {...state} count={fixed.length} monthly={fixed.reduce((sum, s) => sum + s.expectedAmount * PER_MONTH[s.cadence], 0)} />
    : <AheadHero {...state} forecast={data?.forecast} />;
  if (state.error) return <div className="grid gap-6">{hero}<DataState error onRetry={retry} /></div>;
  if (!data || banks.isPending) return <div className="grid gap-6">{hero}</div>;
  if (!banks.data?.some((bank) => bank.lastSyncAt) && data.forecast.length === 0 && data.series.length === 0 && data.installments.plans.length === 0) return <div className="grid gap-6">{hero}<DataState /></div>;

  if (part === "recurring") return (
    <div className="grid gap-6">
      {hero}
      <Subscriptions data={data} money={money} />
      {data.installments.plans.length > 0 && <OpenInstallments data={data.installments} locale={locale} />}
    </div>
  );

  return (
    <div className="grid gap-6">
      {hero}
      <BalanceForecastCard />
      <AccountForecastCard />
      <RecurringCalendar data={data} today={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date())} />
      <Card>
        <CardHeader>
          <CardTitle>{t("forecast")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.forecast.length === 0 && <p className="text-sm leading-relaxed text-muted-foreground">{t("noForecast")}</p>}
          <ul className="grid gap-3">
            {data.forecast.map((f) => (
              <li key={`${f.account}|${f.date}`} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${f.date}T12:00:00`))} · {t("card")} <bdi className="tabular-nums">{f.account?.slice(-4)}</bdi>
                </span>
                <span className="text-lg font-semibold tabular-nums"><bdi>{money(f.total)}</bdi></span>
                <span className="w-full text-sm text-muted-foreground">
                  {t("posted")} {money(f.parts.posted)} · {t("recurring")} {money(f.parts.recurring)} · {t("installments")} {money(f.parts.installments)} · {t("other")} {money(f.parts.discretionary)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <OverdraftCard
        subscriptionsMonthly={data.series.filter((s) => s.status !== "candidate").reduce((sum, s) => sum + s.expectedAmount * PER_MONTH[s.cadence], 0)}
      />

      <More id={part}>
      <Card>
        <CardHeader>
          <CardTitle>{t("anomalies")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.anomalies.length === 0 ? (
            <p className="text-muted-foreground">{t("noAnomalies")}</p>
          ) : (
            <ul className="grid gap-2">
              {data.anomalies.map((a, i) => (
                <li key={i}>{anomalyText(a)}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </More>
    </div>
  );
}

/** What is still owed on installment purchases, how it runs off over the next year, and each plan. */
function OpenInstallments({ data, locale }: { data: InsightsPayload["installments"]; locale: string }) {
  const t = useTranslations("insights");
  const peak = Math.max(...data.months.map((m) => m.total), 1);
  const monthName = new Intl.DateTimeFormat(locale, { month: "short" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("openInstallments")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <p>
          <span className="block text-sm text-muted-foreground">{t("stillOwed")}</span>
          <span className="text-2xl font-semibold tabular-nums">{shekels(data.total, locale)}</span>
        </p>
        <ul className="flex h-24 items-end gap-1" aria-label={t("runoff")}>
          {data.months.map((m) => {
            const label = monthName.format(new Date(`${m.month}-15T12:00:00`));
            return (
              <li key={m.month} className="flex h-full flex-1 flex-col items-center gap-1" title={`${label}: ${shekels(m.total, locale)}`}>
                <span className="flex w-full flex-1 items-end" aria-hidden>
                  <span className="w-full rounded-t-sm bg-primary/70" style={{ height: `${(m.total / peak) * 100}%` }} />
                </span>
                <span className="text-xs text-muted-foreground" aria-hidden>{label}</span>
                <span className="sr-only">{label}: {shekels(m.total, locale)}</span>
              </li>
            );
          })}
        </ul>
        <ul className="grid gap-3">
          {data.plans.map((p) => (
            <li key={`${p.account}|${p.merchant}|${p.amount}|${p.total}`} className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="font-medium">{p.merchant}</span>
              <span className="tabular-nums">{shekels(p.remaining, locale)}</span>
              <span className="w-full text-sm text-muted-foreground tabular-nums">
                {t("paidOf", { paid: p.paid, total: p.total, amount: shekels(p.amount, locale) })}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Subscriptions({ data, money }: { data: InsightsPayload; money: (n: number) => string }) {
  const t = useTranslations("insights");
  const ta = useTranslations("ahead");
  const locale = useLocale();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const chipDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  // Soonest charge first, so the list reads as "what's next".
  const rows = data.series
    .map((s) => ({ s, next: nthCharge(s.cadence, s.lastDate, 1) }))
    .sort((a, b) => a.next.localeCompare(b.next));
  const chip = "rounded-full px-2 py-0.5 text-xs font-medium";
  return (
    <Card id="subscriptions" className="scroll-mt-20">
      {/* The monthly total is the hero figure right above, so the header only names the list. */}
      <CardHeader>
        <CardTitle>{t("subscriptions")}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">{t("noSubscriptions")}</p>
        ) : (
          [[t("dueThisWeek"), rows.filter((r) => r.next <= addDays(today, 7))], [t("upcomingLater"), rows.filter((r) => r.next > addDays(today, 7))]].filter(([, list]) => (list as typeof rows).length > 0).map(([title, list]) => (
          <section key={title as string} aria-label={title as string} className="mb-3 last:mb-0">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title as string} ({(list as typeof rows).length})</h3>
          <ul className="-mx-2 row-grid">
            {(list as typeof rows).map(({ s, next }, i) => {
              const late = next < addDays(today, -5);
              return (
                <li key={`${s.merchant}|${s.currency}|${i}`} className="flex min-h-16 items-center gap-3 px-2 py-3">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                    {s.merchant.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-semibold">{s.merchant}</span>
                      {s.status === "candidate" && <span className={`${chip} bg-muted text-muted-foreground`}>{t("maybe")}</span>}
                      {late && <span className={`${chip} bg-[var(--status-heads-up)]/10 text-[var(--status-heads-up)]`}>{ta("late")}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t(s.cadence)}
                      {s.cadence === "monthly" && <> · {t("usuallyOn", { day: Number(s.lastDate.slice(8)) })}</>}
                    </p>
                    {s.priceChange && (
                      <p className="mt-1 text-xs text-[var(--status-heads-up)]">
                        {t("priceChanged", { from: money(s.priceChange.from), to: money(s.priceChange.to) })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums"><bdi>{money(s.expectedAmount)}</bdi></span>
                    <span className={`${chip} bg-muted text-muted-foreground tabular-nums`} title={chipDate.format(new Date(`${next}T12:00:00Z`))}>{rel.format(Math.round((Date.parse(`${next}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000), "day")}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
