"use client";

import Link from "next/link";
import { MerchantMark } from "@/components/transactions/merchant-mark";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpLeft, ArrowUpRight, Flame, Plus, Repeat, SlidersHorizontal } from "lucide-react";
import { getAssets, getBalanceForecast, getFi, getInsights, getOwners, getPlan } from "@/lib/api";
import { creditUtilization, parseLimits } from "@/lib/credit-utilization";
import { useHousehold } from "@/hooks/use-household";
import { SHARED } from "@/lib/tags";
import { fiNumber, yearsToTarget } from "@/lib/fi";
import { shekels } from "@/lib/money";
import { motionReduced } from "@/lib/a11y-prefs";
import { Sparkline } from "@/components/ui/sparkline";
import { translateCategoryName } from "@/lib/i18n-data";
import { accountLabel } from "@/lib/i18n-data";
import { CardError, CardSkeleton } from "./card-shell";
import { MonthNav, monthKey } from "@/components/ui/month-nav";
import { useMoneyOnTable } from "@/components/transactions/money-on-table-card";
import type { HomePayload } from "@/lib/types";

const PALETTE = ["#ef4444", "#f97316", "#22c55e", "#3b82f6", "#a855f7", "#eab308", "#14b8a6", "#ec4899"];
const CADENCE_DAYS = { weekly: 7, monthly: 30, yearly: 365 } as const;
const PER_MONTH = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 } as const;

/** A dashboard tile: title row with an open link, body below. */
function Tile({ title, href, children, className = "" }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  const t = useTranslations("board");
  return (
    <section aria-label={title} className={`flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {href && <Link href={href} aria-label={t("open", { title })} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowUpLeft className="size-4 ltr:-scale-x-100" aria-hidden /></Link>}
      </div>
      {children}
    </section>
  );
}

function Delta({ value, suffix }: { value: number; suffix: string }) {
  const up = value >= 0;
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${up ? "bg-status-on-track/15 text-status-on-track" : "bg-expense/15 text-expense"}`}><bdi>{up ? "+" : "−"}{Math.abs(value).toFixed(1)}%</bdi><span className="sr-only">{suffix}</span></span>;
}

function useCategoryName() {
  const tCat = useTranslations("categoriesSeeded");
  return (name: string) => translateCategoryName(name, tCat);
}

function useMoney() {
  const locale = useLocale();
  return (n: number) => shekels(Math.round(n), locale);
}

function BalanceTrend() {
  const t = useTranslations("board");
  const money = useMoney();
  const locale = useLocale();
  const q = useQuery({ queryKey: ["balance-forecast"], queryFn: getBalanceForecast });
  const points = q.data?.forecast?.points ?? [];
  if (q.isError) return <CardError label={t("balance")} className="lg:col-span-2" />;
  if (q.isLoading) return <div className="lg:col-span-2"><CardSkeleton label={t("balance")} height={300} /></div>;
  const first = points[0]?.balance ?? 0;
  const low = q.data?.forecast?.low;
  const day = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(d));
  return (
    <Tile title={t("balance")} href="/overview?tab=ahead" className="lg:col-span-2">
      {points.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noBalance")}</p> : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-3xl font-semibold tabular-nums" data-money><bdi>{money(first)}</bdi></p><p className="text-xs uppercase text-muted-foreground">{t("today")}</p></div>
          {low && <div className="text-end text-xs text-muted-foreground"><p className={low.balance < 0 ? "font-semibold text-expense" : "font-semibold text-foreground"} data-money><bdi>{money(low.balance)}</bdi></p><p>{t("lowPoint", { date: day(low.date) })}</p></div>}
        </div>
        <div className="mt-3 h-56" dir="ltr" role="img" aria-label={t("balanceChart", { from: money(first), to: money(points.at(-1)!.balance) })}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs><linearGradient id="bal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(l) => day(String(l))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} />
              <Area isAnimationActive={!motionReduced()} type="monotone" dataKey="balance" name={t("balance")} stroke="var(--primary)" strokeWidth={2} fill="url(#bal)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </>}
    </Tile>
  );
}

const NEED_TONE: Record<string, string> = { need: "bg-status-heads-up/15 text-status-heads-up", want: "bg-status-on-track/15 text-status-on-track", saving: "bg-primary/15 text-primary" };

function LatestTransactions({ data }: { data: HomePayload }) {
  const cat = useCategoryName();
  const t = useTranslations("board");
  const locale = useLocale();
  const rows = (data.recentTransactions ?? []).slice(0, 6);
  const fmt = (n: number, cur: string | null) => new Intl.NumberFormat(locale, { style: "currency", currency: cur || "ILS", maximumFractionDigits: 2 }).format(n);
  return (
    <Tile title={t("latest")} href="/transactions">
      {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noTransactions")}</p> :
        <ul className="-mx-2 flex flex-col">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/transactions?search=${encodeURIComponent(r.description)}&month=${r.date.slice(0, 7)}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <MerchantMark name={r.description} size={30} />
                <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-sm font-medium">{r.categoryName ? cat(r.categoryName) : t("uncategorized")}</span>{r.needType && <span className={`shrink-0 rounded px-1.5 text-[10px] font-semibold leading-4 ${NEED_TONE[r.needType]}`}>{t(`need_${r.needType}`)}</span>}</span><span className="block truncate text-xs text-muted-foreground" title={r.description}>{r.description}</span></span>
                <span className="text-end"><bdi data-money className={`block text-sm font-semibold tabular-nums ${r.kind === "income" ? "text-status-on-track" : r.kind === "expense" ? "text-expense" : ""}`}>{fmt(r.kind === "expense" ? -Math.abs(r.chargedAmount) : r.chargedAmount, r.chargedCurrency)}</bdi><span className="block text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(r.date))}</span></span>
              </Link>
            </li>
          ))}
        </ul>}
    </Tile>
  );
}

function CashFlow({ data }: { data: HomePayload }) {
  const locale = useLocale();
  const t = useTranslations("board");
  const money = useMoney();
  const flow = data.cashFlow;
  const trend = data.historicalTrend ?? [];
  if (!flow) return <CardError label={t("cashFlow")} />;
  const total = flow.income + flow.expenses || 1;
  const saved = flow.income > 0 ? Math.round((flow.net / flow.income) * 100) : null;
  // Spending so far against the same days of last month, not against all of last month.
  const delta = data.thisMonth?.deltaVsLastMonth ?? null;
  return (
    <Tile title={t("cashFlow")} href="/overview?tab=period">
      <div className="flex items-start justify-between gap-2">
        <div><p className={`text-2xl font-semibold tabular-nums ${flow.net >= 0 ? "text-status-on-track" : "text-expense"}`} data-money><bdi>{flow.net >= 0 ? "+" : ""}{money(flow.net)}</bdi></p><p className="text-xs uppercase text-muted-foreground">{t("thisMonth")}</p></div>
        {delta != null ? <Delta value={-delta} suffix={t("vsPrevious")} /> : null}
      </div>
      <div className="my-4 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="bg-status-on-track" style={{ width: `${(flow.income / total) * 100}%` }} /><div className="bg-expense" style={{ width: `${(flow.expenses / total) * 100}%` }} /></div>
      <dl className="grid gap-2 2xl:grid-cols-3">
        {[[t("income"), money(flow.income), "text-status-on-track"], [t("expenses"), money(flow.expenses), "text-expense"], [t("saved"), saved === null ? "—" : `${saved}%`, "text-status-on-track"]].map(([k, v, c]) => (
          <div key={k} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 2xl:block"><dt className="text-[11px] uppercase text-muted-foreground">{k}</dt><dd className={`whitespace-nowrap text-sm font-semibold tabular-nums ${c}`}><bdi data-money>{v}</bdi></dd></div>
        ))}
      </dl>
      {trend.length > 1 && <>
        <p className="mt-4 text-[11px] uppercase text-muted-foreground">{t("previousMonths")}</p>
        <div className="mt-1 h-28" dir="ltr" role="img" aria-label={t("spendTrend")}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend.slice(-6).map((m) => ({ ...m, label: new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${m.month.slice(0, 7)}-01T12:00:00`)) }))} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} cursor={{ fill: "var(--accent)" }} />
              <Bar isAnimationActive={!motionReduced()} dataKey="total" name={t("expenses")} radius={[4, 4, 0, 0]} fill="var(--expense)" fillOpacity={0.85} />
              <Line isAnimationActive={!motionReduced()} dataKey="total" tooltipType="none" type="monotone" stroke="var(--chart-4, #eab308)" strokeDasharray="3 3" dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </>}
    </Tile>
  );
}

function ExpensesStructure({ data }: { data: HomePayload }) {
  const cat = useCategoryName();
  const t = useTranslations("board");
  const money = useMoney();
  const rows = (data.categorySnapshot ?? []).filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = rows.reduce((s, c) => s + c.spent, 0);
  return (
    <Tile title={t("structure")} href="/budget">
      {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noSpend")}</p> : <>
        <div className="relative mx-auto h-48 w-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows.map((c, i) => ({ ...c, name: cat(c.name), fill: c.color || PALETTE[i % PALETTE.length] }))} dataKey="spent" nameKey="name" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false} />
              <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center"><span className="text-xs text-muted-foreground">{t("total")}</span><bdi data-money className="text-lg font-semibold tabular-nums">{money(total)}</bdi></div>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {rows.slice(0, 6).map((c, i) => <li key={c.categoryId} className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: c.color || PALETTE[i % PALETTE.length] }} aria-hidden /><span className="truncate" title={cat(c.name)}>{cat(c.name)}</span><span className="ms-auto tabular-nums text-muted-foreground">{Math.round((c.spent / total) * 100)}%</span></li>)}
        </ul>
      </>}
    </Tile>
  );
}

function FireProgress() {
  const t = useTranslations("board");
  const money = useMoney();
  const q = useQuery({ queryKey: ["fi"], queryFn: getFi });
  if (q.isError) return <CardError label={t("fire")} />;
  if (!q.data) return <CardSkeleton label={t("fire")} height={240} />;
  const { netWorth, monthlyIncome, monthlyExpenses } = q.data;
  const target = fiNumber(monthlyExpenses * 12, 0.04);
  const pct = target > 0 ? Math.max(0, Math.min(100, (netWorth / target) * 100)) : 0;
  const years = target > 0 ? yearsToTarget(netWorth, monthlyIncome - monthlyExpenses, 0.04, target) : null;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <Tile title={t("fire")} href="/fi">
      {monthlyExpenses <= 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noFire")}</p> :
        <div className="flex flex-1 flex-wrap items-center gap-5">
          <div className="relative size-32 shrink-0">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden><circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" /><circle cx="60" cy="60" r={r} fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} /></svg>
            <div className="absolute inset-0 grid place-content-center text-center"><bdi className="text-2xl font-semibold tabular-nums">{pct.toFixed(1)}%</bdi><span className="text-[11px] uppercase text-muted-foreground">{t("toFire")}</span></div>
          </div>
          <dl className="min-w-40 flex-1 space-y-2 text-sm">
            <div><dt className="flex items-center gap-1 text-[11px] uppercase text-primary"><Flame className="size-3" aria-hidden />{t("timeToFire")}</dt><dd className="font-semibold">{years === null ? t("notOnTrack") : t("years", { n: Math.ceil(years) })}</dd></div>
            <div className="flex justify-between gap-2 border-t border-border pt-2"><dt className="text-muted-foreground">{t("netWorth")}</dt><dd data-money><bdi>{money(netWorth)}</bdi></dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("fireNumber")}</dt><dd data-money><bdi>{money(target)}</bdi></dd></div>
          </dl>
        </div>}
    </Tile>
  );
}

function CategoriesWatchlist({ data }: { data: HomePayload }) {
  const cat = useCategoryName();
  const t = useTranslations("board");
  const money = useMoney();
  const rows = (data.categories ?? []).slice(0, 6);
  return (
    <Tile title={t("watchlist")} href="/budget" className="@container lg:col-span-2">
      {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noSpend")}</p> :
        <ul className="-mx-2 grid gap-x-6 @2xl:grid-cols-2">
          {rows.map((c) => (
            <li key={c.categoryId}>
              <Link href={`/transactions?category=${c.categoryId}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm" title={cat(c.name)}>{cat(c.name)}</span>
                <Sparkline values={c.trend} color={c.color} label={t("trendOf", { name: cat(c.name) })} className="h-6 w-16" />
                <bdi data-money className="w-24 text-end text-sm font-semibold tabular-nums text-expense">{money(-c.spent)}</bdi>
              </Link>
            </li>
          ))}
        </ul>}
    </Tile>
  );
}

function RecurringPayments() {
  const t = useTranslations("board");
  const money = useMoney();
  const locale = useLocale();
  const q = useQuery({ queryKey: ["insights"], queryFn: getInsights });
  const today = new Date().toISOString().slice(0, 10);
  const items = useMemo(() => (q.data?.series ?? []).filter((s) => s.status === "suggested").map((s) => {
    const next = new Date(s.lastDate);
    while (next.toISOString().slice(0, 10) < today) next.setDate(next.getDate() + CADENCE_DAYS[s.cadence]);
    return { ...s, next: next.toISOString().slice(0, 10) };
  }).sort((a, b) => a.next.localeCompare(b.next)), [q.data, today]);
  if (q.isError) return <CardError label={t("recurring")} />;
  if (!q.data) return <CardSkeleton label={t("recurring")} height={240} />;
  const monthly = items.reduce((s, x) => s + x.expectedAmount * PER_MONTH[x.cadence], 0);
  return (
    <Tile title={t("recurring")} href="/recurring">
      {items.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noRecurring")}</p> : <>
        <p className="text-2xl font-semibold tabular-nums" data-money><bdi>{money(monthly)}</bdi></p>
        <p className="text-xs text-muted-foreground">{t("activePerMonth", { n: items.length })}</p>
        <p className="mt-4 text-[11px] uppercase text-muted-foreground">{t("upcoming")}</p>
        <ul className="mt-1">
          {items.slice(0, 5).map((s) => (
            <li key={`${s.merchant}|${s.account}|${s.cadence}`} className="flex min-h-10 items-center gap-3 text-sm">
              <Repeat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {/* The date sits under the name, so a narrow tile keeps the name whole. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" title={s.merchant}>{s.merchant}</span>
                <span className="block text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(s.next))}</span>
              </span>
              <bdi data-money className="w-20 text-end font-semibold tabular-nums">{money(s.expectedAmount)}</bdi>
            </li>
          ))}
        </ul>
      </>}
    </Tile>
  );
}

/** Who spent what this month, per household member; each opens that member's transactions. */
function WhoSpent() {
  const t = useTranslations("board");
  const tTags = useTranslations("tags");
  const money = useMoney();
  const { household } = useHousehold();
  const now = new Date();
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10);
  const q = useQuery({ queryKey: ["owners", from, to], queryFn: () => getOwners(from, to) });
  if (q.isError) return <CardError label={t("whoSpent")} />;
  if (!q.data) return <CardSkeleton label={t("whoSpent")} height={200} />;
  const rows = [...household.members.map((m) => ({ id: m.id, name: m.name })), { id: SHARED, name: tTags("shared") }]
    .map((r) => ({ ...r, spent: q.data.summary.byOwner[r.id] ?? 0 })).filter((r) => r.spent > 0);
  const max = Math.max(1, ...rows.map((r) => r.spent));
  return (
    <Tile title={t("whoSpent")} href="/transactions">
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("noSpend")}</p> : <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/transactions?owner=${encodeURIComponent(r.id)}`} className="block rounded-lg p-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <span className="mb-1 flex justify-between gap-2 text-sm"><span className="font-medium">{r.name}</span><bdi className="font-semibold tabular-nums" data-money>{money(r.spent)}</bdi></span>
              <span className="block h-2 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.spent / max) * 100}%` }} /></span>
            </Link>
          </li>
        ))}
      </ul>}
      {q.data.summary.settlements.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{q.data.summary.settlements.map((x) => tTags("settlement", { from: x.from === SHARED ? tTags("shared") : household.members.find((m) => m.id === x.from)?.name ?? "", to: x.to === SHARED ? tTags("shared") : household.members.find((m) => m.id === x.to)?.name ?? "", amount: money(x.amount) })).join(" · ")}</p>}
    </Tile>
  );
}

/** Credit utilization: card balances against limits the person enters once (banks don't send them). */
function CreditUtilization() {
  const t = useTranslations("board");
  const tBanks = useTranslations("banks");
  const money = useMoney();
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const pref = useQuery({ queryKey: ["preference", "card-limits"], queryFn: () => loadPreference("card-limits") });
  const [editing, setEditing] = useState<string | null>(null);
  const tCommon = useTranslations("common");
  if (assets.isError) return <CardError label={t("credit")} />;
  if (!assets.data || !pref.isFetched) return <CardSkeleton label={t("credit")} height={200} />;
  const cards = assets.data.assets.filter((a) => a.isLiability && a.type === "credit").map((a) => ({ name: a.name, label: accountLabel(a, tBanks), owed: a.valueIls ?? 0 }));
  const limits = parseLimits(pref.data);
  const u = creditUtilization(cards, limits);
  const save = (name: string, value: number) => {
    const next = { ...limits, [name]: value };
    if (!(value > 0)) delete next[name];
    qc.setQueryData(["preference", "card-limits"], next);
    void storePreference("card-limits", next).catch(() => toast.error(t("saveFailed")));
    setEditing(null);
  };
  const tone = (used: number) => (used > 0.7 ? "bg-expense" : used > 0.3 ? "bg-[var(--status-heads-up)]" : "bg-status-on-track");
  return (
    <Tile title={t("credit")} href="/accounts">
      {cards.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("noCards")}</p> : <>
        {u.used != null && <>
          <p className="flex items-baseline gap-2"><bdi className="text-2xl font-semibold tabular-nums">{Math.round(u.used * 100)}%</bdi><span className="text-xs text-muted-foreground">{t("utilized")}</span><bdi className="ms-auto text-xs text-muted-foreground tabular-nums" data-money>{money(u.owed)} / {money(u.limit)}</bdi></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden><div className={`h-full rounded-full ${tone(u.used)}`} style={{ width: `${Math.min(100, u.used * 100)}%` }} /></div>
        </>}
        <ul className="mt-3 space-y-2.5">
          {u.rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium" title={r.label}>{r.label}</span>
                {editing === r.name ? (
                  <form className="flex items-center gap-1" onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} onSubmit={(e) => { e.preventDefault(); save(r.name, Number(new FormData(e.currentTarget).get("limit"))); }}>
                    <input name="limit" type="number" inputMode="decimal" min="0" step="100" autoFocus defaultValue={r.limit ?? ""} aria-label={t("limitFor", { name: r.label })} className="h-11 w-24 rounded-md border border-border bg-background px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring" />
                    <button type="submit" className="h-11 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">{t("saveLimit")}</button>
                    <button type="button" onClick={() => setEditing(null)} className="h-11 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{tCommon("cancel")}</button>
                  </form>
                ) : r.limit ? (
                  <button type="button" onClick={() => setEditing(r.name)} aria-label={t("editLimit", { name: r.label })} className="rounded-md px-1 text-xs tabular-nums text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"><bdi>{money(r.owed)} / {money(r.limit)}</bdi> · <bdi>{Math.round((r.used ?? 0) * 100)}%</bdi></button>
                ) : (
                  <button type="button" onClick={() => setEditing(r.name)} className="rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring">{t("setLimit")}</button>
                )}
              </div>
              {r.used != null && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className={`h-full rounded-full ${tone(r.used)}`} style={{ width: `${Math.min(100, r.used * 100)}%` }} /></div>}
            </li>
          ))}
        </ul>
        {u.missing > 0 && <p className="mt-3 text-xs text-muted-foreground">{t("limitsHint")}</p>}
      </>}
    </Tile>
  );
}

/** The yearly total the savings checks found, and the biggest two, linking to the full list. */
function MoneyOnTableTile() {
  const t = useTranslations("moneyOnTable");
  const locale = useLocale();
  const table = useMoneyOnTable();
  if (table === "error") return <CardError label={t("title")} />;
  if (table === "loading") return <CardSkeleton label={t("title")} height={200} />;
  return (
    <Tile title={t("title")} href="/optimizations">
      <p className="text-3xl font-semibold tabular-nums">{shekels(table.total, locale)}<span className="ms-2 text-sm font-normal text-muted-foreground">{t("perYear")}</span></p>
      {table.saved > 0 && <p className="mt-1 text-sm text-status-on-track">{t("saved", { amount: shekels(table.saved, locale) })}</p>}
      {table.items.length === 0
        ? <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
        : <ul className="mt-3 space-y-2 text-sm">{table.items.slice(0, 3).map((i) => (
            <li key={i.key} className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate">{t(`${i.kind}.title`, { name: i.name ?? "" })}</span><span className="shrink-0 tabular-nums font-medium">{i.yearly == null ? t("unknown") : shekels(i.yearly, locale)}</span></li>
          ))}</ul>}
    </Tile>
  );
}


/** This month's spending against the budget, with the month's pace marked on the bar. */
function BudgetTile({ data }: { data: HomePayload }) {
  const t = useTranslations("board");
  const locale = useLocale();
  const m = data.thisMonth;
  if (!m) return null;
  const used = m.budget > 0 ? m.spent / m.budget : null;
  const over = used != null && used > 1;
  return (
    <Tile title={t("budgetTile")} href="/budget">
      <p className="flex items-baseline gap-2"><bdi className="text-2xl font-semibold tabular-nums" data-money>{shekels(Math.round(m.spent), locale)}</bdi>
        {m.budget > 0 && <span className="text-xs text-muted-foreground" data-money>{t("ofBudget", { amount: shekels(Math.round(m.budget), locale) })}</span>}</p>
      {used != null ? <>
        <div className="relative mt-3 h-2 rounded-full bg-muted" aria-hidden>
          <div className={`h-full rounded-full ${over ? "bg-expense" : "bg-primary"}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
          <span className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60" style={{ insetInlineStart: `${Math.min(100, m.timeElapsedPercent)}%` }} />
        </div>
        <p className={`mt-2 text-xs ${over ? "text-expense" : "text-muted-foreground"}`}>{over ? t("budgetOver", { amount: shekels(Math.round(m.spent - m.budget), locale) }) : t("budgetPace", { used: Math.round(used * 100), month: Math.round(m.timeElapsedPercent) })}</p>
      </> : <p className="mt-2 text-sm text-muted-foreground">{t("noBudget")}</p>}
    </Tile>
  );
}

/** What waits for a look: uncategorized, unsure and flagged transactions, each a link to the review list. */
function AttentionTile({ data }: { data: HomePayload }) {
  const t = useTranslations("board");
  const th = useTranslations("home");
  const a = data.needsAttention;
  if (!a) return null;
  const rows = [
    { label: th("needsAttentionUncategorized"), n: a.uncategorized },
    { label: th("needsAttentionLowConfidence"), n: a.lowConfidence },
    { label: th("needsAttentionFlagged"), n: a.flagged },
  ];
  const total = a.uncategorized + a.lowConfidence + a.flagged;
  return (
    <Tile title={th("needsAttention")} href="/transactions?review=1">
      {total === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("allReviewed")}</p> : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.label}><Link href="/transactions?review=1" className="flex min-h-11 items-center gap-3 text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
              <span className="flex-1">{r.label}</span>
              <span className={`min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${r.n ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}`}>{r.n}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

/** Savings goals, closest to done first, each with its bar. */
function GoalsTile() {
  const t = useTranslations("board");
  const locale = useLocale();
  const { data } = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  if (!data) return <CardSkeleton label={t("goals")} height={200} />;
  const goals = [...data.goals].sort((a, b) => b.savedAmount / b.targetAmount - a.savedAmount / a.targetAmount).slice(0, 4);
  return (
    <Tile title={t("goals")} href="/journey">
      {goals.length === 0 ? <Link href="/journey" className="block py-6 text-center text-sm text-primary hover:underline">{t("noGoals")}</Link> : (
        <ul className="space-y-3">
          {goals.map((g) => {
            const p = Math.min(1, g.savedAmount / g.targetAmount);
            return (
              <li key={g.id}>
                <div className="flex items-baseline gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium" title={g.name}>{g.name}</span><span className="text-xs tabular-nums text-muted-foreground">{Math.round(p * 100)}%</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className={`h-full rounded-full ${p >= 1 ? "bg-status-on-track" : "bg-primary"}`} style={{ width: `${p * 100}%` }} /></div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground" data-money>{shekels(Math.round(g.savedAmount), locale)} / {shekels(Math.round(g.targetAmount), locale)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}

const TILES = ["balance", "savings", "budget", "latest", "cashFlow", "structure", "fire", "watchlist", "recurring", "attention", "goals", "credit", "members"] as const;
type TileId = typeof TILES[number];

/** The home dashboard: one grid of tiles. "Customize" hides or shows tiles, saved per profile. */
export function DashboardBoard({ data, isLoading, isError, owner = "", onOwnerChange, month: shownMonth = "", onMonthChange }: { data: HomePayload | undefined; isLoading: boolean; isError: boolean; owner?: string; onOwnerChange?: (owner: string) => void; month?: string; onMonthChange?: (month: string) => void }) {
  const tOwner = useTranslations("ownerFilter");
  const tMot = useTranslations("moneyOnTable");
  const t = useTranslations("board");
  const qc = useQueryClient();
  const month = new Intl.DateTimeFormat(useLocale(), { month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format(new Date());
  const [editing, setEditing] = useState(false);
  const { household } = useHousehold();
  const pref = useQuery({ queryKey: ["preference", "home-board"], queryFn: () => loadPreference("home-board") });
  const raw = (pref.data as { hidden?: unknown } | null)?.hidden;
  const hidden = Array.isArray(raw) ? raw.filter((x): x is TileId => (TILES as readonly unknown[]).includes(x)) : [];
  const toggle = (id: TileId, show: boolean) => {
    const next = { hidden: show ? hidden.filter((x) => x !== id) : [...hidden, id] };
    qc.setQueryData(["preference", "home-board"], next);
    void storePreference("home-board", next).catch(() => toast.error(t("saveFailed")));
  };
  const homeTile = (render: (d: HomePayload) => React.ReactNode, label: string) =>
    isError ? <CardError label={label} /> : isLoading || !data ? <CardSkeleton label={label} height={240} /> : render(data);
  const tiles: Record<TileId, { label: string; node: React.ReactNode }> = {
    balance: { label: t("balance"), node: <BalanceTrend /> },
    savings: { label: tMot("title"), node: <MoneyOnTableTile /> },
    budget: { label: t("budgetTile"), node: homeTile((d) => <BudgetTile data={d} />, t("budgetTile")) },
    latest: { label: t("latest"), node: homeTile((d) => <LatestTransactions data={d} />, t("latest")) },
    cashFlow: { label: t("cashFlow"), node: homeTile((d) => <CashFlow data={d} />, t("cashFlow")) },
    structure: { label: t("structure"), node: homeTile((d) => <ExpensesStructure data={d} />, t("structure")) },
    fire: { label: t("fire"), node: <FireProgress /> },
    watchlist: { label: t("watchlist"), node: homeTile((d) => <CategoriesWatchlist data={d} />, t("watchlist")) },
    recurring: { label: t("recurring"), node: <RecurringPayments /> },
    attention: { label: t("attention"), node: homeTile((d) => <AttentionTile data={d} />, t("attention")) },
    goals: { label: t("goals"), node: <GoalsTile /> },
    credit: { label: t("credit"), node: <CreditUtilization /> },
    members: { label: t("whoSpent"), node: <WhoSpent /> },
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/transactions?add=1" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary md:hidden px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-4" aria-hidden />{t("addTransaction")}</Link>
        {/* Month arrows: the month's figures (budget, cash flow, structure, watchlist) follow; balance, goals and FIRE stay today's. */}
        {onMonthChange ? <MonthNav value={shownMonth || monthKey(new Date())} onChange={(m) => onMonthChange(m === monthKey(new Date()) ? "" : m)} />
          : <span className="rounded-lg border border-border px-3 py-2 text-sm font-medium">{month}</span>}
        <div className="flex flex-wrap gap-2">
          {onOwnerChange && household.members.length >= 2 && (
            <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm">{tOwner("filter")}
              <select value={owner} onChange={(e) => onOwnerChange(e.target.value)} className="bg-transparent text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                <option value="">{tOwner("everyone")}</option>
                {household.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="shared">{tOwner("shared")}</option>
              </select>
            </label>
          )}
          <Link href="/transactions?review=1" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t("review")}<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden /></Link>
          <button type="button" aria-expanded={editing} aria-controls="board-customize" onClick={() => setEditing(!editing)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${editing ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}><SlidersHorizontal className="size-4" aria-hidden />{t("customize")}</button>
        </div>
      </div>
      {editing && (
        <fieldset id="board-customize" className="rounded-2xl border border-border bg-card p-4">
          <legend className="px-1 text-sm font-semibold">{t("customizeTitle")}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {TILES.filter((id) => id !== "members" || household.members.length >= 2).map((id) => (
              <label key={id} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-ring">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!hidden.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />{tiles[id].label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {/* Dense packing: a wide tile never leaves a hole beside it. */}
      <div className="grid grid-flow-row-dense gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TILES.filter((id) => !hidden.includes(id) && (id !== "members" || household.members.length >= 2)).map((id) => <Fragment key={id}>{tiles[id].node}</Fragment>)}
      </div>
    </div>
  );
}
