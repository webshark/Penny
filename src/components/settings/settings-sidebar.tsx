"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  SlidersHorizontal,
  Palette,
  Landmark,
  Send,
  Sparkles,
  Layers,
  ListFilter,
  Users,
  HeartHandshake,
  Lock,
  Accessibility,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  FileUp,
  LifeBuoy,
  Tag,
  Store,
  Coins,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

export const SETTINGS_GROUPS: NavGroup[] = [
  // Personal: how the app looks and behaves for you.
  { titleKey: "groupPersonal", items: [
    { href: "/settings/appearance", labelKey: "appearance", Icon: Palette, match: (p) => p.startsWith("/settings/appearance") },
    { href: "/settings/language", labelKey: "language", Icon: Languages, match: (p) => p.startsWith("/settings/language") },
    { href: "/settings/general", labelKey: "general", Icon: SlidersHorizontal, match: (p) => p.startsWith("/settings/general") },
    { href: "/settings/privacy", labelKey: "privacy", Icon: Lock, match: (p) => p.startsWith("/settings/privacy") },
    { href: "/settings/accessibility", labelKey: "a11y.nav", Icon: Accessibility, match: (p) => p.startsWith("/settings/accessibility") },
  ] },
  // Workspace: the household data and its connections.
  { titleKey: "groupWorkspace", items: [
    { href: "/settings/currencies", labelKey: "currencies", Icon: Coins, match: (p) => p.startsWith("/settings/currencies") },
    { href: "/settings/categories", labelKey: "categories", Icon: Layers, match: (p) => p.startsWith("/settings/categories") },
    { href: "/settings/tags", labelKey: "tags", Icon: Tag, match: (p) => p.startsWith("/settings/tags") },
    { href: "/settings/payees", labelKey: "payees", Icon: Store, match: (p) => p.startsWith("/settings/payees") },
    { href: "/settings/account-groups", labelKey: "accountGroups", Icon: Layers, match: (p) => p.startsWith("/settings/account-groups") },
    { href: "/settings/rules", labelKey: "rules", Icon: ListFilter, match: (p) => p.startsWith("/settings/rules") },
    { href: "/settings/data", labelKey: "data", Icon: FileUp, match: (p) => p.startsWith("/settings/data") },
    { href: "/settings/bank", labelKey: "bank", Icon: Landmark, match: (p) => p.startsWith("/settings/bank") },
    { href: "/settings/ai", labelKey: "ai", Icon: Sparkles, match: (p) => p.startsWith("/settings/ai") },
    { href: "/settings/telegram", labelKey: "telegram", Icon: Send, match: (p) => p.startsWith("/settings/telegram") },
    { href: "/settings/household", labelKey: "household", Icon: Users, match: (p) => p.startsWith("/settings/household") },
    { href: "/settings/legacy", labelKey: "legacy.nav", Icon: HeartHandshake, match: (p) => p.startsWith("/settings/legacy") },
  ] },
];

/** Help closes the menu, under a line of its own. */
export const SETTINGS_HELP: NavItem = { href: "/help", labelKey: "navGroups.pages.help", Icon: LifeBuoy, match: (p) => p.startsWith("/help") };

/**
 * The settings frame, inside the normal app layout (the app's side menu stays): /settings is the full list of sections,
 * and every section page has the list as a card beside it on wide screens and a "Back to settings" link on narrow ones.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("settings.sidebar");
  const isIndex = pathname === "/settings";
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed((c) => !c);
  return (
    <div className={cn("mx-auto flex w-full items-start gap-6 px-4 pb-8 pt-3 md:px-8", isIndex ? "max-w-[720px]" : "max-w-6xl")}>
      {!isIndex && (
        <nav aria-label={t("title")} className={cn("sticky top-20 hidden max-h-[calc(100vh-6rem)] shrink-0 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-sm transition-[width] duration-300 ease-[var(--ease-soft)] motion-reduce:transition-none lg:block", collapsed ? "w-16" : "w-60")}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            title={collapsed ? t("expand") : t("collapse")}
            className="mb-2 flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-footnote text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {collapsed ? <PanelLeftOpen className="size-4 shrink-0 rtl:rotate-180" aria-hidden /> : <PanelLeftClose className="size-4 shrink-0 rtl:rotate-180" aria-hidden />}
            <span className={cn(collapsed && "sr-only")}>{collapsed ? t("expand") : t("collapse")}</span>
          </button>
          <SettingsNavList compact={collapsed} />
        </nav>
      )}
      <div className="min-w-0 max-w-[760px] flex-1">
        {!isIndex && (
          <Link href="/settings" className="mb-3 inline-flex min-h-10 items-center gap-1 rounded-lg pe-2 text-footnote font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden">
            <ChevronRight className="size-4 ltr:rotate-180" aria-hidden />
            {t("backToSettings")}
          </Link>
        )}
        <div key={pathname} className="page-in">{children}</div>
      </div>
    </div>
  );
}

function useItemLabel() {
  const tSidebar = useTranslations("settings.sidebar");
  const tRoot = useTranslations();
  return (item: NavItem) => (item.labelKey.includes(".") ? tRoot(item.labelKey) : tSidebar(item.labelKey));
}

/** The menu card beside a section page: two titled groups, then Help under a line. Compact shows icons only. */
function SettingsNavList({ compact }: { compact: boolean }) {
  const pathname = usePathname();
  const tSidebar = useTranslations("settings.sidebar");
  const label = useItemLabel();
  const row = (item: NavItem) => {
    const active = item.match(pathname);
    const text = label(item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          title={compact ? text : undefined}
          className={cn(
            "flex min-h-8 items-center gap-2.5 rounded-lg px-2.5 text-footnote transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-accent hover:text-foreground"
          )}
        >
          <item.Icon className="size-4 shrink-0" aria-hidden />
          <span className={cn("truncate", compact && "sr-only")}>{text}</span>
        </Link>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.titleKey}>
          <p className={cn("mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", compact && "sr-only")}>{tSidebar(group.titleKey)}</p>
          <ul className="flex flex-col gap-0.5">{group.items.map(row)}</ul>
        </div>
      ))}
      <ul className="border-t border-border pt-2">{row(SETTINGS_HELP)}</ul>
    </div>
  );
}

/** /settings: every section as a row (icon, name, chevron) in two groups, then Help. */
export function SettingsIndex() {
  const tSidebar = useTranslations("settings.sidebar");
  const label = useItemLabel();
  const row = (item: NavItem) => (
    <li key={item.href}>
      <Link href={item.href} className="flex min-h-12 items-center gap-3 px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <item.Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate">{label(item)}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
  return (
    <nav aria-label={tSidebar("title")} className="overflow-hidden rounded-2xl border border-border bg-card py-2 shadow-sm">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.titleKey} className="pb-2">
          <h2 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tSidebar(group.titleKey)}</h2>
          <ul>{group.items.map(row)}</ul>
        </div>
      ))}
      <ul className="border-t border-border pt-2">{row(SETTINGS_HELP)}</ul>
    </nav>
  );
}
