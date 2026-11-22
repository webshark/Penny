"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { getHome, getInsights, getSettings } from "@/lib/api";
import { PageHeader } from "@/components/layout/app-shell";
import { ThisMonthCard } from "./this-month-card";
import { CashFlowCard } from "./cash-flow-card";
import { Greeting } from "./greeting";
import { SuggestionsTipsCard } from "./suggestions-tips-card";
import { NextBillCard, SubscriptionsCard } from "./bills-card";
import { HealthCard } from "./health-card";
import { MonthCelebration } from "./month-celebration";
import { PersonalGrid } from "./personal-grid";
import { ScenarioCard } from "./scenario-card";
import { GoalFocus } from "./goal-focus";
import { WelcomePrompt } from "./home-teasers";
import { CategoryScroll } from "./category-scroll";
import { HistoricalTrendCard } from "./historical-trend-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { TopMerchantsCard } from "./top-merchants-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { BankHealthCard } from "./bank-health-card";
import { SyncFailureBanner } from "./sync-failure-banner";
import { SimpleHome } from "./simple-home";
import { MoneyMap } from "./money-map";
import { DashboardBoard } from "./dashboard-board";
import { QuickStartRail } from "./quick-start-rail";
import { NextStep } from "./today-card";
import { QuickActions } from "./quick-actions";
import { PetHeroAside } from "./pet-card";
import { usePlan } from "@/hooks/use-plan";
import { CardError, CardSkeleton } from "./card-shell";
import type { HomePayload, HomeSection } from "@/lib/types";

export function HomePage({ focus = false }: { focus?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");
  const t = useTranslations("home");
  const skeletonLabels = useMemo<Record<HomeSection, string>>(
    () => ({
      thisMonth: t("thisMonthLabel", { month: "" }).trim() || t("topCategoriesTitle"),
      cashFlow: t("cashFlowTitle"),
      categorySnapshot: t("topCategoriesTitle"),
      historicalTrend: t("last8Months"),
      recentTransactions: t("recentActivity"),
      topMerchants: t("topMerchants"),
      needsAttention: t("needsAttention"),
      bankHealth: t("bankConnections"),
      categories: t("categoriesTitle"),
    }),
    [t]
  );

  useEffect(() => {
    if (autoStartSync) {
      router.replace("/", { scroll: false });
    }
  }, [autoStartSync, router]);

  // "view as member" on the dashboard; the unscoped key stays ["home"], shared with the sidebar.
  const [owner, setOwner] = useState("");
  // The month the board shows; "" is this month (and keeps the shared ["home"] key).
  const [boardMonth, setBoardMonth] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: owner || boardMonth ? ["home", owner, boardMonth] : ["home"],
    queryFn: () => getHome(owner || undefined, boardMonth || undefined),
    placeholderData: keepPreviousData,
  });

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: insights } = useQuery({ queryKey: ["insights"], queryFn: getInsights });
  const { plan, loaded } = usePlan();
  const detail = searchParams.get("view") === "detail";
  // ?view=detail shows the advanced home without changing the saved mode.
  // Focus (/focus) is the one-page home; it is reached only from its own menu item.
  const simple = focus;
  const companion = plan.homeStyle === "companion";
  // Pocket Pal sits in the purple card, at its end side (visual left in Hebrew).
  // The intro invite rides with the pet instead of taking a block of its own.
  const petAside = loaded && plan.pet.enabled ? <PetHeroAside extra={<WelcomePrompt variant="pip" />} /> : undefined;
  const nextStep = <NextStep home={data} homePending={isLoading} homeFailed={isError} />;
  const linkClass = "mx-auto flex min-h-11 w-fit items-center rounded-full px-4 text-footnote font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";
  // Two homes: the raze one-pager, or everything Home knows, expanded. Leaving the detail view first.
  // Until the plan loads, show only what both styles share (greeting and this month's card), so neither style flashes.
  if (!loaded) {
    return (
      <>
        <PageHeader title={simple ? t("focusTitle") : t("pageTitle")} largeTitle={false} />
        <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
          <SyncFailureBanner items={data?.bankHealth ?? null} className="mb-4 md:mb-5 lg:mb-6" />
          <Greeting name={settings?.displayName} />
          <div className="rise-in mb-3"><QuickActions /></div>
          <CardSkeleton label={t("cashFlowTitle")} height={280} />
        </div>
      </>
    );
  }

  if (!simple) {
    return <>
      <PageHeader title={simple ? t("focusTitle") : t("pageTitle")} largeTitle={false} />
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-6 md:px-8">
        <SyncFailureBanner items={data?.bankHealth ?? null} />
        {/* The board, with Quick start beside it on wide screens and above it on narrow ones. */}
        <div className="flex flex-col gap-4 xl:flex-row-reverse xl:items-start">
          <QuickStartRail />
          <div className="min-w-0 flex-1"><DashboardBoard data={data} isLoading={isLoading} isError={isError} owner={owner} onOwnerChange={setOwner} month={boardMonth} onMonthChange={setBoardMonth} /></div>
        </div>
      </div>
    </>;
  }

  // The companion style: one calm overview, unless simple mode asks for the compact hero.
  if (companion && !detail) {
    return (
      <>
        <PageHeader title={simple ? t("focusTitle") : t("pageTitle")} largeTitle={false} />
        <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
          <SyncFailureBanner items={data?.bankHealth ?? null} className="mb-4 md:mb-5 lg:mb-6" />
          {/* Simple mode keeps the page quiet: adding and importing live in the card's own menu row. */}
          {!simple && <div className="rise-in mb-3"><QuickActions /></div>}
          {simple ? (
            <SimpleHome name={settings?.displayName} extra={nextStep} heroAside={petAside} />
          ) : (
            <>
              <Greeting name={settings?.displayName} />
              <SimpleHome name={settings?.displayName} cardOnly extra={nextStep} heroAside={petAside} />
              <MoneyMap />
            </>
          )}
          {!petAside && <WelcomePrompt />}
          {!simple && <Link href="/?view=detail" className={linkClass}>{t("detailLink")}</Link>}
        </div>
      </>
    );
  }

  return (
    <>
      {/* The view is chosen in the sidebar menu, not by a toggle on the page. */}
      <PageHeader title={simple ? t("focusTitle") : t("pageTitle")} largeTitle={false} />
      {/* The detail view of the Companion style always offers the way back. */}
      {companion && <div className="mx-auto w-full max-w-[1920px] px-4 pt-3 md:px-6 lg:px-8"><Link href="/" className="inline-flex min-h-11 items-center rounded-full px-3 text-footnote font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t("companionLink")}</Link></div>}
      {!simple && <div className="rise-in mx-auto w-full max-w-[1920px] px-4 pb-1 md:px-6 lg:px-8"><QuickActions /></div>}
      {simple ? (
        <div className="px-4 pb-8 pt-3"><SimpleHome name={settings?.displayName} extra={nextStep} heroAside={petAside} /></div>
      ) : (

      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <SyncFailureBanner
          items={data?.bankHealth ?? null}
          className="mb-4 md:mb-5 lg:mb-6"
        />
        <Greeting name={settings?.displayName} />
        {/* The same forecast card as Simple mode: forecast, rings, legend and the month so far. */}
        <SimpleHome name={settings?.displayName} cardOnly extra={nextStep} heroAside={petAside} />
        <SuggestionsTipsCard />
        <HealthCard />
        <MonthCelebration />
        {!petAside && <WelcomePrompt />}
        <PersonalGrid render={id => {
          if (id === "goals") return <GoalFocus />;
          if (id === "planner") return <ScenarioCard />;
          if (id === "bills") return insights ? <div className="space-y-3"><NextBillCard data={insights} /><SubscriptionsCard data={insights} /></div> : <CardSkeleton label={t("nextBill")} />;
          return renderSection(id, data, isLoading, isError, "", skeletonLabels);
        }} />
      </div>
      )}
    </>
  );
}

function renderSection(
  section: HomeSection,
  data: HomePayload | undefined,
  isLoading: boolean,
  isError: boolean,
  spanClass: string,
  skeletonLabels: Record<HomeSection, string>
) {
  if (isError) {
    return <div key={section} className={spanClass}><CardError label={skeletonLabels[section]} /></div>;
  }

  if (isLoading || !data) {
    return (
      <div key={section} className={spanClass}>
        <CardSkeleton label={skeletonLabels[section]} height={SKELETON_HEIGHTS[section]} />
      </div>
    );
  }

  const sectionHasError =
    isError || data.errors.some((e) => e.section === section);

  if (sectionHasError) {
    return (
      <div key={section} className={spanClass}>
        <CardError label={skeletonLabels[section]} />
      </div>
    );
  }

  return (
    <div key={section} className={spanClass}>
      {renderCard(section, data)}
    </div>
  );
}

function renderCard(section: HomeSection, data: HomePayload) {
  switch (section) {
    case "thisMonth":
      return data.thisMonth ? <ThisMonthCard data={data.thisMonth} /> : null;
    case "cashFlow":
      return data.cashFlow ? <CashFlowCard data={data.cashFlow} /> : null;
    case "categorySnapshot":
      // Superseded on Home by the category scroll.
      return null;
    case "categories":
      return data.categories ? <CategoryScroll items={data.categories} /> : null;
    case "historicalTrend":
      return data.historicalTrend ? (
        <HistoricalTrendCard data={data.historicalTrend} />
      ) : null;
    case "recentTransactions":
      return data.recentTransactions ? (
        <RecentTransactionsCard items={data.recentTransactions} />
      ) : null;
    case "topMerchants":
      return data.topMerchants ? (
        <TopMerchantsCard items={data.topMerchants} />
      ) : null;
    case "needsAttention":
      return data.needsAttention ? (
        <NeedsAttentionCard data={data.needsAttention} />
      ) : null;
    case "bankHealth":
      return data.bankHealth ? (
        <BankHealthCard items={data.bankHealth} />
      ) : null;
  }
}

const SKELETON_HEIGHTS: Record<HomeSection, number> = {
  thisMonth: 180,
  cashFlow: 160,
  categorySnapshot: 220,
  historicalTrend: 180,
  recentTransactions: 280,
  topMerchants: 220,
  needsAttention: 160,
  bankHealth: 160,
  categories: 480,
};
