"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAssets } from "@/lib/api";
import { netWorthDrivers } from "@/lib/net-worth-drivers";
import { shekels } from "@/lib/money";
import { motionReduced } from "@/lib/a11y-prefs";
import { CardShell } from "@/components/home/card-shell";
import type { OverviewPayload } from "@/lib/types";

/** Net worth drivers: how much of each month's net worth change was saving, and how much was the rest. */
export function NetWorthDriversCard({ data }: { data: OverviewPayload }) {
  const t = useTranslations("netWorthDrivers");
  const locale = useLocale();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  if (!assets.data) return null;
  const saved = Object.fromEntries(data.monthly.map((m) => [m.month, m.income - m.expenses]));
  const months = new Set(data.period.months);
  const rows = netWorthDrivers(assets.data.history, saved).filter((r) => months.has(r.month));
  if (rows.length === 0) return null;
  const money = (n: number) => shekels(Math.round(n), locale);
  const chart = rows.map((r) => ({ ...r, label: new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${r.month}-01T12:00:00`)) }));
  const total = rows.reduce((s, r) => ({ change: s.change + r.change, saved: s.saved + r.saved, market: s.market + r.market }), { change: 0, saved: 0, market: 0 });
  const summary = t("summary", { change: money(total.change), saved: money(total.saved), market: money(total.market) });
  return (
    <CardShell label={t("title")}>
      <p className="mb-3 text-sm text-muted-foreground">{summary}</p>
      <div className="h-56" dir="ltr" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={44} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip formatter={(v, name) => [money(Number(v)), t(name === "saved" ? "saved" : "market")]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} cursor={{ fill: "var(--accent)" }} />
            <Bar dataKey="saved" stackId="d" fill="var(--status-on-track)" radius={[3, 3, 0, 0]} isAnimationActive={!motionReduced()} />
            <Bar dataKey="market" stackId="d" fill="var(--primary)" radius={[3, 3, 0, 0]} isAnimationActive={!motionReduced()} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        {[["var(--status-on-track)", t("saved")], ["var(--primary)", t("market")]].map(([c, l]) => <li key={l} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} aria-hidden />{l}</li>)}
      </ul>
    </CardShell>
  );
}
