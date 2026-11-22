"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { PageWheelNav } from "./page-wheel-nav";
import { AlertNotifier } from "./alert-notifier";
import { UpdateBanner } from "./update-banner";
import { BottomBar } from "./bottom-bar";
import { TopBar } from "./top-bar";
import { SideRail } from "./side-rail";
import { PrivacyHotkey } from "@/components/settings/privacy-mode-switch";
import { useTranslations } from "next-intl";
import { NAVIGATION_GROUPS } from "./navigation-groups";
import { SETTINGS_GROUPS, SETTINGS_HELP } from "@/components/settings/settings-sidebar";
import { InfoTip } from "@/components/ui/info-tip";
import { usePathname } from "next/navigation";
import { usePlan } from "@/hooks/use-plan";
import { wantsExplanations } from "@/lib/plan";
import { pagePurposeKey } from "@/lib/orientation";
import { MobileDock } from "./mobile-dock";
import { PetMini } from "@/components/home/pet-card";
import { PipLife } from "@/components/home/pip-life";
import { SectionTabs } from "./section-tabs";
import { A11yButton } from "@/components/a11y/a11y-menu";
import { AnalyticsNav } from "@/components/analytics/analytics-nav";

/** Lives in the root layout so the collapsed state survives page changes. */
export function SidebarRoot({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  return <SidebarProvider defaultOpen={defaultOpen}>{children}</SidebarProvider>;
}

// Screens without the app's frame: the lock screen, "who's using" and the access sign-in.
const FRAMELESS = ["/lock", "/profiles", "/access"];

/**
 * The app's frame (side menu, top bar, side rail, dock), mounted once in the root layout so it stays put
 * while pages change: only the page content fades in. Settings keep their own menu card mounted the same way.
 */
export function PersistentShell({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  if (FRAMELESS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return <>{children}</>;
  const inHub = NAVIGATION_GROUPS.find((g) => g.key === "analytics")!.items.some((i) => i.match(pathname));
  // Settings animate inside their own frame (see SettingsFrame), so the frame itself is not re-keyed per section.
  const key = pathname.startsWith("/settings") ? "/settings" : pathname;
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-background focus:px-5 focus:py-3 focus:outline-2">{t("skipToContent")}</a>
      <AppSidebar />
      <SidebarInset id="main-content" tabIndex={-1} className="mobile-dock-content">
        <UpdateBanner />
        <TopBar />
        {inHub
          ? <div className="flex items-start gap-2 md:ps-6 lg:ps-8"><div className="pt-[4.5rem]"><AnalyticsNav /></div><div key={key} className="page-in min-w-0 flex-1">{children}</div></div>
          : <div key={key} className="page-in">{children}</div>}
        <Suspense fallback={null}><PageWheelNav /></Suspense>
        <AlertNotifier />
        <BottomBar />
        <PrivacyHotkey />
        <PipLife />
      </SidebarInset>
      <SideRail />
      <MobileDock />
    </>
  );
}

/** Pages still wrap themselves in this; the frame itself now lives in the root layout (PersistentShell). */
export function AppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** One quiet row: the page title (and its context line) on the start, the page's few actions on the end. Sticks on scroll. */
export function PageHeader({
  title,
  meta,
  actions,
  largeTitle = true,
}: {
  title: string;
  meta?: string;
  actions?: ReactNode;
  /** Off where the page opens with its own big heading (Home's greeting, a purple hero card); the title stays for screen readers. */
  largeTitle?: boolean;
}) {
  const tPurpose = useTranslations("purpose");
  const tNavGroups = useTranslations("navGroups");
  const pathname = usePathname();
  // Pages that share an area with tabs show the area's name, so the title never disagrees with the menu.
  const tRoot = useTranslations();
  const tSettings = useTranslations("settings.sidebar");
  // The title is always the name the menu uses: a settings section's own name, the dashboard for both of its views.
  const settingsItem = pathname.startsWith("/settings/") ? [...SETTINGS_GROUPS.flatMap((g) => g.items), SETTINGS_HELP].find((i) => i.match(pathname)) : undefined;
  const group = settingsItem ? undefined : NAVIGATION_GROUPS.find(g => g.items.some(item => item.match(pathname)));
  const page = group?.items.find(item => item.href === pathname);
  const heading = settingsItem
    ? (settingsItem.labelKey.includes(".") ? tRoot(settingsItem.labelKey) : tSettings(settingsItem.labelKey))
    : pathname === "/" || pathname === "/focus" ? tNavGroups("groups.dashboard")
    : page ? tNavGroups(`pages.${page.key}`) : title;
  // The dashboard speaks for itself: its title is kept for screen readers and the tab, not shown.
  const hideTitle = pathname === "/" || pathname === "/focus";
  const eyebrow = settingsItem ? tSettings("title") : group && group.items.length > 1 ? tNavGroups(`groups.${group.key}`) : null;
  const { plan } = usePlan();
  // One plain line on what this page is for, only for those who asked for more explanations.
  const key = wantsExplanations(plan) ? pagePurposeKey(pathname) : null;
  const purpose = key && largeTitle && tPurpose.has(key) ? tPurpose(key) : null;
  const [scrolled, setScrolled] = useState(false);
  // Every page sets its own tab title, so tabs, history and screen readers can tell pages apart.
  useEffect(() => { document.title = `${heading} · Penny`; }, [heading]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Publishes the sticky header's height as --app-header-h, so sticky list headers (week rows) sit just under it.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    // On <body>: the theme script rewrites <html>'s style attribute.
    const publish = () => document.body.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header ref={headerRef} className={`sticky top-0 z-20 transition-[box-shadow,background-color] duration-150 ${scrolled ? "header-bar shadow-[0_0.5px_0_var(--border)]" : "bg-transparent"}`}>
      {/* Nothing to show on desktop folds the row away, but the menu keeps its corner: it is the only way around in Simple mode. */}
      <div className={`mx-auto grid min-h-16 max-w-[1920px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 md:px-6 lg:px-8 ${hideTitle && !actions ? "md:min-h-0 md:py-0" : ""}`}>
        {/* The menu sits at the page's top corner: Simple mode's own hamburger, or the side menu's trigger on phones. */}
        <div className="col-start-1 row-start-1 -ms-1 flex items-center gap-1 self-center justify-self-start">
          <div className="flex items-center gap-1 md:hidden">
            <SidebarTrigger />
            <PetMini />
          </div>
        </div>
        {/* self-start: the title sits on the same line on every page, with or without a meta line under it. */}
        <div className="col-start-2 row-start-1 flex min-w-0 flex-col items-start text-start">
          {eyebrow && <p className="mb-0.5 text-xs text-muted-foreground">{eyebrow}</p>}
          <div className="relative min-w-0 max-w-full">
            <h1 title={heading} className={hideTitle ? "sr-only" : "truncate text-[1.625rem] leading-8 font-bold tracking-tight"}>{heading}</h1>
            {/* The "i" hangs off the title's end so the title itself stays on the center line. */}
            <span className="absolute start-full top-1/2 flex -translate-y-1/2 items-center">
              {meta && meta.length > 24 && <InfoTip text={meta} />}
              {purpose && <InfoTip text={purpose} />}
            </span>
          </div>
          {/* Short context (a month) on its own line under the title. */}
          {meta && meta.length <= 24 && <p className="truncate text-footnote text-muted-foreground">{meta}</p>}
        </div>
        {/* Accessibility menu on phones (the sidebar footer has it on larger screens). */}
        <A11yButton size="icon" className="col-start-3 row-start-1 self-center justify-self-end sm:hidden" />
        <div className="col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-2 max-sm:col-span-3 max-sm:col-start-1 max-sm:row-start-2 max-sm:justify-center">{actions}</div>
      </div>
      <Suspense fallback={null}><SectionTabs /></Suspense>
    </header>
  );
}
