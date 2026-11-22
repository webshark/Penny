"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftIcon, Search, ChevronDown, Plus } from "lucide-react";
import { getActivity, getHome } from "@/lib/api";
import { getLockStatus } from "@/components/settings/app-lock-card";
import { useSyncState } from "@/components/home/sync-status-pill";
import { OPEN_COMMAND_PALETTE } from "./command-palette";
import { useTranslations } from "next-intl";
import { NAVIGATION_GROUPS } from "./navigation-groups";
import {
  LayoutDashboard,
  Focus,
  PieChart,
  Landmark,
  Flag,
  Wallet,
  ArrowLeftRight,
  LayoutGrid,
  Calculator,
  BookOpen,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { IconButton } from "@/components/ui/icon-button";
import { usePlan } from "@/hooks/use-plan";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { SidebarAccounts } from "./sidebar-accounts";

interface NavDef {
  href: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

/** The four main areas. Everything else lives inside one of them (as a tab) or in search. */
export const NAV: NavDef[] = [
  { href: "/", labelKey: "home", Icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/transactions", labelKey: "transactions", Icon: ArrowLeftRight, match: (p: string) => p.startsWith("/transactions") },
  {
    href: "/budget",
    labelKey: "budget",
    Icon: Wallet,
    match: (p: string) => ["/budget", "/overview", "/insights"].some((r) => p.startsWith(r)),
  },
  {
    href: "/investments",
    labelKey: "future",
    Icon: Flag,
    match: (p: string) => ["/investments", "/fi", "/journey", "/life"].some((r) => p.startsWith(r)),
  },
  {
    href: "/more",
    labelKey: "more",
    Icon: LayoutGrid,
    // Calculators and the occasional tools; the hub stays lit while you use one.
    match: (p: string) => ["/more", "/calculators", "/recap", "/ask", "/wellbeing", "/help", "/control", "/markets", "/learn", "/car", "/discounted-home"].some((r) => p.startsWith(r)),
  },
];

/** Pages that are not in the menu but still found by search. */
export const SEARCH_PAGES: NavDef[] = [
  { href: "/calculators", labelKey: "calculators", Icon: Calculator, match: (p: string) => p.startsWith("/calculators") },
  { href: "/learn", labelKey: "learn", Icon: BookOpen, match: (p: string) => p.startsWith("/learn") },
  { href: "/overview", labelKey: "overview", Icon: PieChart, match: (p: string) => p.startsWith("/overview") },
  { href: "/fi", labelKey: "fi", Icon: Landmark, match: (p: string) => p.startsWith("/fi") },
];

export const FOOTER_NAV: NavDef[] = [
  {
    href: "/settings",
    labelKey: "settings",
    Icon: SettingsIcon,
    match: (p: string) => p.startsWith("/settings"),
  },
];

/** One wheel notch moves one page; this is the pause before the next can. */
const WHEEL_COOLDOWN_MS = 350;

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const tNavGroups = useTranslations("navGroups");
  const { setOpenMobile, toggleSidebar, state, isMobile, setOpen } = useSidebar();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const lock = useQuery({ queryKey: ["lock"], queryFn: getLockStatus });
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });
  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: (q) => (q.state.data?.sync.active ? 3000 : 15000),
    refetchIntervalInBackground: false,
  });
  const sync = useSyncState(home.data?.bankHealth ?? null, activity ?? null);
  const { plan } = usePlan();
  // Settings lives as an icon by the workspace, but the wheel still reaches it last.
  const pages = NAVIGATION_GROUPS.flatMap(group => group.items);
  const lastWheel = useRef(0);
  // Wheel over the menu steps through the pages, top to bottom.
  function onWheel(e: React.WheelEvent) {
    if (!plan.wheelPaging || Math.abs(e.deltaY) < 4) return;
    const now = e.timeStamp;
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    const list = pages;
    const i = list.findIndex((p) => p.match(pathname));
    const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + (e.deltaY > 0 ? 1 : -1)))];
    if (next && !next.match(pathname)) { e.preventDefault(); router.push(next.href); }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-3" onWheel={onWheel}>
        {/* No logo row: the brand lives on the profile picker. Add-transaction leads; the sync status is in the profile menu. */}
        <SidebarGroup className="pb-1 md:hidden">
          <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:flex-col">
            <SidebarMenu className="min-w-0 flex-1"><SidebarMenuItem><SidebarMenuButton tooltip={tShell("addTransaction")} className="min-h-10 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" render={<Link href="/transactions?add=1" onClick={() => setOpenMobile(false)}><Plus aria-hidden /><span>{tShell("addTransaction")}</span></Link>} /></SidebarMenuItem></SidebarMenu>
          </div>
        </SidebarGroup>
        <SidebarSeparator className="mx-3 w-auto md:hidden" />
        <SidebarGroup className="pb-0 md:hidden">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => { setOpenMobile(false); window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE)); }}
                tooltip={`${t("search")} (Ctrl K)`}
                aria-keyshortcuts="Control+K Meta+K /"
                aria-haspopup="dialog"
              >
                <Search />
                <span className="flex-1">{t("search")}</span>
                <kbd dir="ltr" className="rounded border border-sidebar-border px-1.5 text-[0.6875rem] text-muted-foreground group-data-[collapsible=icon]:hidden">/</kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {NAVIGATION_GROUPS.map((group, index) => {
          const activeGroup = group.items.some(item => item.match(pathname));
          const expanded = expandedGroups[group.key] ?? activeGroup;
          const compact = state === "collapsed" && !isMobile;
          const GroupIcon = group.Icon;
          const panelId = `navigation-group-${index}`;
          // Focus and the full dashboard are two views of one home: a single split control, not two menu rows.
          if (group.key === "focus") return null;
          if (group.key === "dashboard") {
            const views = [
              { href: "/focus", label: tNavGroups("views.focus"), Icon: Focus },
              { href: "/", label: tNavGroups("views.full"), Icon: LayoutDashboard },
            ];
            const current = views.find((v) => v.href === pathname);
            if (compact) {
              const v = current ?? views[1];
              return <SidebarGroup key={group.key} className="py-1"><SidebarMenu><SidebarMenuItem><SidebarMenuButton
                render={<Link href={v.href} aria-current={current ? "page" : undefined}><v.Icon aria-hidden /><span>{tNavGroups("groups.dashboard")}</span></Link>}
                isActive={!!current} tooltip={tNavGroups("groups.dashboard")} /></SidebarMenuItem></SidebarMenu></SidebarGroup>;
            }
            return (
              <SidebarGroup key={group.key} className="py-1">
                <p id="home-views" className="sr-only">{tNavGroups("groups.dashboard")}</p>
                <div role="group" aria-labelledby="home-views" className="grid grid-cols-2 gap-1 rounded-xl bg-sidebar-accent p-1">
                  {views.map((v) => {
                    const on = v.href === pathname;
                    return (
                      <Link key={v.href} href={v.href} onClick={() => setOpenMobile(false)} aria-current={on ? "page" : undefined}
                        className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none ${on ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/8%),0_1px_6px_-2px_rgb(0_0_0/10%)]" : "text-muted-foreground hover:text-foreground"}`}>
                        <v.Icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{v.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </SidebarGroup>
            );
          }
          // A one-page group (Dashboard) or a hub (Analytics, which has its own menu) is a plain link, not a folder.
          if (group.items.length === 1 || ("hub" in group && group.hub)) {
            const only = group.items[0];
            const label = group.items.length === 1 ? tNavGroups(`pages.${only.key}`) : tNavGroups(`groups.${group.key}`);
            return <SidebarGroup key={group.key} className="py-1"><SidebarMenu><SidebarMenuItem><SidebarMenuButton
              render={<Link href={only.href} onClick={() => setOpenMobile(false)} aria-current={activeGroup ? "page" : undefined}><GroupIcon aria-hidden /><span>{label}</span></Link>}
              isActive={activeGroup} tooltip={label}
              className="min-h-11 font-semibold data-[active=true]:bg-primary/10 data-[active=true]:text-primary" /></SidebarMenuItem></SidebarMenu></SidebarGroup>;
          }
          return (
        <SidebarGroup key={group.key} className="py-1">
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton
            tooltip={tNavGroups(`groups.${group.key}`)}
            aria-expanded={expanded && !compact}
            aria-controls={panelId}
            className={`min-h-11 font-semibold ${activeGroup ? "text-primary" : ""}`}
            onClick={() => { if (compact) { setOpen(true); setExpandedGroups(previous => ({...previous, [group.key]: true})); } else setExpandedGroups(previous => ({...previous, [group.key]: !expanded})); }}
          ><GroupIcon aria-hidden /><span className="flex-1">{tNavGroups(`groups.${group.key}`)}</span><ChevronDown aria-hidden className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} /></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
          <div className="reveal" data-open={expanded && !compact} inert={!expanded || compact}><div>
          <SidebarGroupContent id={panelId} className="ms-4 mt-1 w-auto border-s border-sidebar-border ps-3">
            <SidebarMenu>
              {group.items.map((item) => {
                const label = tNavGroups(`pages.${item.key}`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} onClick={() => setOpenMobile(false)} aria-current={item.match(pathname) ? "page" : undefined}>
                          <item.Icon aria-hidden />
                          <span>{label}</span>
                        </Link>
                      }
                      isActive={item.match(pathname)}
                      tooltip={label}
                      className="min-h-10 rounded-lg text-sm data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
          </div></div>
        </SidebarGroup>
        ); })}
        <SidebarAccounts onNavigate={() => setOpenMobile(false)} />
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border">
        {/* The profile opens a menu with accessibility, settings, help and lock; collapse sits beside it. */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher
              onSettings={() => { setOpenMobile(false); router.push("/settings"); }}
              sync={{ label: sync.state.label, dot: sync.styles.dot, busy: sync.styles.pulse, alert: sync.state.tone === "error" || sync.state.tone === "warn" }}
              onLock={lock.data?.enabled ? async () => {
                await fetch("/api/lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lock" }) });
                router.replace("/lock");
              } : undefined}
            />
          </div>
          <IconButton label={t("toggleSidebar")} size="icon-sm" variant="ghost" onClick={toggleSidebar}>
            <PanelLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
          </IconButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
