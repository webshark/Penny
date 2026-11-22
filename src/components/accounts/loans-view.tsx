"use client";

import { TYPE_ICON } from "./account-icons";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { getAssets } from "@/lib/api";
import { debtPayoff } from "@/lib/plan";
import { monthsFrom, weightedRate } from "@/lib/loans";
import { shekels } from "@/lib/money";
import { CardError, CardSkeleton } from "@/components/home/card-shell";

const LOAN_TYPES = new Set(["mortgage", "loan", "other_liability"]);
const COLORS = ["#a78bfa", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#14b8a6"];

/** Loans: what is owed, what it costs a month, and when each loan ends. */
export function LoansView() {
  const t = useTranslations("loans");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const money = (n: number) => shekels(Math.round(n), locale);
  const month = (ym: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(`${ym}-01T12:00:00`));
  if (q.isError) return <CardError label={t("title")} />;
  if (!q.data) return <CardSkeleton label={t("title")} height={260} />;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const loans = q.data.assets.filter((a) => a.isLiability && LOAN_TYPES.has(a.type)).map((a, i) => {
    const balance = Math.abs(a.valueIls ?? 0);
    const p = a.monthlyPayment ? debtPayoff(balance, a.interestRate ?? 0, a.monthlyPayment) : null;
    // For a debt, the cost field holds the amount first borrowed, so the card can show how much is repaid.
    const original = a.costBasis && a.costBasis >= balance ? a.costBasis : null;
    return { id: a.id, name: a.name, type: a.type, note: a.note, balance, original, rate: a.interestRate, monthly: a.monthlyPayment, payoff: p, color: COLORS[i % COLORS.length] };
  }).sort((a, b) => b.balance - a.balance);

  const add = <Link href="/investments" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-4" aria-hidden />{t("add")}</Link>;
  if (!loans.length) return (
    <div className="space-y-4"><div className="flex justify-end">{add}</div>
      <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p></div>
  );

  const total = loans.reduce((s, l) => s + l.balance, 0);
  const monthly = loans.reduce((s, l) => s + (l.monthly ?? 0), 0);
  const rate = weightedRate(loans);
  const known = loans.filter((l) => l.payoff);
  const interest = known.reduce((s, l) => s + l.payoff!.interest, 0);
  const lastMonths = known.length === loans.length ? Math.max(...known.map((l) => l.payoff!.months)) : null;
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  const originalTotal = loans.reduce((s, l) => s + (l.original ?? 0), 0);
  const totalWithOriginal = loans.reduce((s, l) => s + (l.original ? l.balance : 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">{add}</div>
      <section aria-label={t("summary")} className="grid gap-5 rounded-2xl border border-border bg-card p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div><p className={label}>{t("totalOwed")}</p><p className="text-3xl font-semibold tabular-nums" data-money><bdi>{money(total)}</bdi></p>
          {originalTotal > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("repaidOf", { pct: Math.round((1 - totalWithOriginal / originalTotal) * 100), original: money(originalTotal) })}</p>}</div>
        <div>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>{loans.map((l) => <div key={l.id} style={{ width: `${(l.balance / total) * 100}%`, background: l.color }} />)}</div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{loans.map((l) => <li key={l.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden /><span className="text-muted-foreground">{l.name}</span><bdi className="font-semibold tabular-nums" data-money>{money(l.balance)}</bdi></li>)}</ul>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div><dt className={label}>{t("monthly")}</dt><dd className="font-semibold tabular-nums" data-money><bdi>{money(monthly)}</bdi></dd></div>
          <div><dt className={label}>{t("avgRate")}</dt><dd className="font-semibold tabular-nums">{rate == null ? "—" : <bdi>{rate.toFixed(2)}%</bdi>}</dd></div>
          <div><dt className={label}>{t("interestLeft")}</dt><dd className="font-semibold tabular-nums" data-money><bdi>{known.length ? money(interest) : "—"}</bdi></dd></div>
          <div><dt className={label}>{t("debtFree")}</dt><dd className="font-semibold">{lastMonths == null ? "—" : month(monthsFrom(today, lastMonths))}</dd></div>
        </dl>
      </section>

      {/* Loan cards: what is left of what was borrowed, how far along, and the four numbers that matter. */}
      <ul aria-label={t("list")} className="grid gap-3 xl:grid-cols-2">
        {loans.map((l) => {
          const paid = l.original ? 1 - l.balance / l.original : null;
          return (
            <li key={l.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <Link href={`/accounts/${l.id}`} className="block px-5 py-4 hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-sm" style={{ background: `color-mix(in oklab, ${l.color} 20%, transparent)` }} aria-hidden>{(() => { const Icon = TYPE_ICON[l.type === "mortgage" ? "mortgage" : "loan"]; return <Icon className="size-4" />; })()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{l.name}</span><span className="block truncate text-xs text-muted-foreground">{t(`type_${l.type}`)}{l.note ? ` · ${l.note}` : ""}</span></span>
                  <span className="text-end"><bdi data-money className="block font-semibold tabular-nums">{money(l.balance)}</bdi>{l.original && <span className="block text-xs text-muted-foreground">{t("ofOriginal", { amount: money(l.original) })}</span>}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-status-on-track" style={{ width: `${Math.max(0, Math.min(100, (paid ?? 0) * 100))}%` }} /></div>
                <div className="mt-1 flex justify-between gap-3 text-xs">
                  <span className="font-medium text-status-on-track">{paid != null ? t("paidPct", { pct: Math.round(paid * 100) }) : <span className="text-muted-foreground">{t("noOriginal")}</span>}</span>
                  <span className="text-muted-foreground">{l.payoff ? t("monthsLeft", { n: l.payoff.months }) : l.monthly ? t("neverEnds") : ""}</span>
                </div>
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <div className="flex gap-1.5"><dt className="text-muted-foreground">{t("col_rate")}</dt><dd className="font-semibold tabular-nums">{l.rate == null ? "—" : <bdi>{l.rate}%</bdi>}</dd></div>
                  <div className="flex gap-1.5"><dt className="text-muted-foreground">{t("col_monthly")}</dt><dd className="font-semibold tabular-nums">{l.monthly ? <bdi data-money>{money(l.monthly)}</bdi> : "—"}</dd></div>
                  <div className="flex gap-1.5"><dt className="text-muted-foreground">{t("col_payoff")}</dt><dd className="font-semibold">{l.payoff ? month(monthsFrom(today, l.payoff.months)) : "—"}</dd></div>
                  <div className="flex gap-1.5"><dt className="text-muted-foreground">{t("col_interestLeft")}</dt><dd className="font-semibold tabular-nums">{l.payoff ? <bdi data-money>{money(l.payoff.interest)}</bdi> : "—"}</dd></div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
      {loans.some((l) => !l.monthly) && <p className="text-xs text-muted-foreground">{t("missingHint")}</p>}
    </div>
  );
}
