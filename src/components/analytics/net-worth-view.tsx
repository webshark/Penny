"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAssets } from "@/lib/api";
import { groupAccounts } from "@/lib/account-groups";
import { accountLabel } from "@/lib/i18n-data";
import { shekels, signedShekels } from "@/lib/money";
import { motionReduced } from "@/lib/a11y-prefs";
import { Segmented } from "@/components/ui/segmented";
import { DataState } from "@/components/ui/data-state";
import { GROUP_ICON } from "@/components/accounts/account-icons";

const RANGES = { "6m": 6, "1y": 12, all: Infinity } as const;
type Range = keyof typeof RANGES;

/** Net worth over time: the line, how much it moved in the chosen range, and what it is made of today. */
export function NetWorthView() {
  const t = useTranslations("netWorthView");
  const tAcc = useTranslations("accountsView");
  const tBanks = useTranslations("banks");
  const locale = useLocale();
  const [range, setRange] = useState<Range>("1y");
  const q = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  if (q.isError) return <DataState error onRetry={() => void q.refetch()} />;
  if (!q.data) return <DataState loading />;
  const { totals, history, assets } = q.data;
  const since = new Date();
  since.setMonth(since.getMonth() - RANGES[range]);
  const points = (Number.isFinite(RANGES[range]) ? history.filter((h) => new Date(`${h.date}T12:00:00`) >= since) : history);
  const first = points[0];
  const change = first ? totals.netWorth - first.netWorth : null;
  const day = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(new Date(`${d}T12:00:00`));
  const groups = groupAccounts(assets.map((a) => ({ ...a, name: accountLabel(a, tBanks) })));
  const biggest = Math.max(...groups.map((g) => Math.abs(g.total)), 1);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label={t("title")} className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{t("today")}</p>
            <p className="text-3xl font-semibold tabular-nums"><bdi data-money>{shekels(totals.netWorth, locale)}</bdi></p>
            {change != null && <p className={`mt-1 text-sm tabular-nums ${change >= 0 ? "text-status-on-track" : "text-expense"}`}><bdi data-money>{signedShekels(change, locale)}</bdi> <span className="text-muted-foreground">{t(`since_${range}`)}</span></p>}
          </div>
          <Segmented label={t("range")} value={range} onChange={(v) => setRange(v as Range)} options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: t(`range_${r}`) }))} />
        </div>
        {points.length < 2 ? <p className="py-16 text-center text-sm text-muted-foreground">{t("notEnough")}</p> : (
          <div className="mt-4 h-72" role="img" aria-label={t("chartLabel", { from: shekels(first.netWorth, locale), to: shekels(totals.netWorth, locale) })}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs><linearGradient id="nw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tickFormatter={(v: number) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(v) => shekels(Number(v), locale)} labelFormatter={(l) => day(String(l))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} />
                <Area isAnimationActive={!motionReduced()} type="monotone" dataKey="netWorth" name={t("title")} stroke="var(--primary)" strokeWidth={2} fill="url(#nw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section aria-labelledby="nw-parts" className="rounded-2xl border border-border bg-card p-5">
        <h2 id="nw-parts" className="mb-3 text-[15px] font-semibold">{t("parts")}</h2>
        <ul className="space-y-3">
          {groups.map((g) => {
            const Icon = GROUP_ICON[g.key];
            return (
              <li key={g.key}>
                <div className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{tAcc(`groups.${g.key}`)}</span>
                  <bdi data-money className={`tabular-nums ${g.total < 0 ? "text-expense" : "font-medium"}`}>{shekels(g.total, locale)}</bdi>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className={`h-full rounded-full ${g.total < 0 ? "bg-expense" : "bg-primary"}`} style={{ width: `${(Math.abs(g.total) / biggest) * 100}%` }} /></div>
              </li>
            );
          })}
        </ul>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
          <div><dt className="text-muted-foreground">{t("assets")}</dt><dd className="font-semibold tabular-nums"><bdi data-money>{shekels(totals.assets, locale)}</bdi></dd></div>
          <div><dt className="text-muted-foreground">{t("debts")}</dt><dd className="font-semibold tabular-nums text-expense"><bdi data-money>{shekels(-totals.liabilities, locale)}</bdi></dd></div>
        </dl>
      </section>
    </div>
  );
}
