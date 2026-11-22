"use client";

import Link from "next/link";
import { GoalsHero } from "@/components/ui/page-hero";
import { Plus } from "lucide-react";
import { CardShell } from "@/components/home/card-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { VacationPlans } from "./vacation-plans";
import { CustomGoals } from "./custom-goals";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { getAssets, getFi, getPlan, getRecap } from "@/lib/api";
import { useHousehold } from "@/hooks/use-household";
import { detectMilestones, sortNewestFirst, type Milestone } from "@/lib/milestones";
import { lastCompleteMonth, shiftMonth } from "@/lib/recap";

const ils = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

// shortcut: one recap call per month for the last 12; move to a server endpoint if more history is needed.
const MONTHS = 12;

export function JourneyView() {
  const t = useTranslations("journey");
  const tH = useTranslations("household");
  const locale = useLocale();
  const { household, loading } = useHousehold();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const fi = useQuery({ queryKey: ["fi"], queryFn: getFi });
  const last = lastCompleteMonth(new Date().toISOString().slice(0, 10));
  const recaps = useQueries({
    queries: Array.from({ length: MONTHS }, (_, i) => shiftMonth(last, -i)).map((month) => ({
      queryKey: ["recap", month],
      queryFn: () => getRecap({ month }),
    })),
  });

  const me = household.members.find((m) => m.role === "me")?.name;
  const months = recaps.flatMap((r) => (r.data?.mode === "month" ? [{ month: r.data.recap.month, income: r.data.recap.income, kept: r.data.recap.kept }] : []));
  const milestones = detectMilestones({
    history: assets.data?.history ?? [],
    liabilities: (assets.data?.assets ?? []).filter((a) => a.isLiability).map((a) => ({ name: a.name, value: a.valueIls, updatedAt: a.updatedAt })),
    goals: plan.data?.goals ?? [],
    months,
    cashReserve: fi.data?.cashReserve ?? 0,
    monthlyExpenses: fi.data?.monthlyExpenses ?? 0,
  });

  const fmtDate = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-IL", { year: "numeric", month: "long" });
  const items = sortNewestFirst([
    ...household.events.map((e) => ({ key: `e-${e.id}`, date: e.date as string | null, title: tH(`event.${e.type}`), body: t(`eventNote.${e.type}`), life: true })),
    ...milestones.map((m, i) => ({ key: `m-${i}`, date: m.date, title: milestoneTitle(m), body: milestoneBody(m), life: false })),
  ]);

  function milestoneTitle(m: Milestone): string {
    switch (m.kind) {
      case "netWorth": return t("netWorthTitle", { amount: ils(m.amount, locale) });
      case "debtPaid": return t("debtPaidTitle", { name: m.name });
      case "goalReached": return t("goalTitle", { name: m.name });
      case "savingsRate": return t("savingsRateTitle", { rate: Math.round(m.rate * 100) });
      case "emergency": return t("emergencyTitle", { months: m.months });
    }
  }
  function milestoneBody(m: Milestone): string {
    const who = me ?? "";
    switch (m.kind) {
      case "netWorth": return t("netWorthBody", { name: who });
      case "debtPaid": return t("debtPaidBody");
      case "goalReached": return t("goalBody");
      case "savingsRate": return t("savingsRateBody", { month: fmtDate.format(new Date(`${m.month}-01`)) });
      case "emergency": return t("emergencyBody", { months: m.months });
    }
  }

  const goals = (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <CustomGoals />
      <VacationPlans />
    </div>
  );
  const addEvent = (
    <Link href="/settings/household" className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-footnote font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
      <Plus className="size-4" aria-hidden />{t("addEvent")}
    </Link>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <GoalsHero />
      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {goals}
        <CardShell label={t("title")} action={addEvent} className="h-auto">
          {loading || assets.isLoading ? (
            <div className="space-y-3" aria-busy><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><span className="sr-only">{t("loading")}</span></div>
          ) : items.length === 0 ? (
            <p className="text-footnote text-pretty text-muted-foreground">{t("empty")}</p>
          ) : (
            <>
              <p className="mb-5 text-footnote text-pretty text-muted-foreground">{t("intro")}</p>
              <ol className="relative space-y-5 border-s-2 border-border/70 ps-5">
                {items.map((it) => (
                  <li key={it.key} className="relative">
                    <span aria-hidden className={`absolute -start-[1.69rem] top-1 size-3 rounded-full ring-4 ring-card ${it.life ? "bg-muted-foreground" : "bg-primary"}`} />
                    <p className="text-caption font-medium text-muted-foreground">{it.date ? fmtDate.format(new Date(it.date)) : t("now")}</p>
                    <h3 className="mt-0.5 font-semibold">{it.title}</h3>
                    <p className="text-footnote text-pretty text-muted-foreground">{it.body}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardShell>
      </div>
    </div>
  );
}
