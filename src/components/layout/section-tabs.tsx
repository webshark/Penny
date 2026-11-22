"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAVIGATION_GROUPS } from "./navigation-groups";
import { cn } from "@/lib/utils";

/** Pages that live together under one main area, shown as tabs so each area is one place in the menu. */
export const SECTIONS = [
  [
    { href: "/overview?tab=period", key: "summary" },
    { href: "/overview?tab=ahead", key: "ahead" },
  ],
] as const;

export const sectionOf = (pathname: string) => SECTIONS.find((s) => s.some((x) => pathname.startsWith(x.href.split("?")[0])));

export function SectionTabs() {
  const t = useTranslations("sections");
  const tNavGroups = useTranslations("navGroups");
  const pathname = usePathname();
  const tab = useSearchParams().get("tab") ?? "period";
  // A tab matches by path, and by ?tab= when it names one.
  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    return pathname.startsWith(path) && (!query || query === `tab=${tab}`);
  };
  const section = SECTIONS.find((s) => s.some((x) => pathname.startsWith(x.href.split("?")[0])));
  const group = NAVIGATION_GROUPS.find(group => group.items.some(item => item.match(pathname)));
  // An area's own tabs everywhere; its menu group's pages only on phones, since wider screens show them in the side menu.
  const links = section
    ? section.map((x) => ({ href: x.href, label: t(x.key), active: isActive(x.href) }))
    : group && group.items.length > 1 && !pathname.startsWith("/settings")
      ? group.items.map((item) => ({ href: item.href, label: tNavGroups(`pages.${item.key}`), active: item.match(pathname) }))
      : null;
  if (!links) return null;
  return (
    <nav aria-label={section ? t(section[0].key) : tNavGroups(`groups.${group!.key}`)} className={cn("mx-auto flex max-w-[1920px] gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:px-8 [&::-webkit-scrollbar]:hidden", !section && "md:hidden")}>
      {links.map((x) => (
        <Link key={x.href} href={x.href} ref={x.active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined} aria-current={x.active ? "page" : undefined} className={cn("min-h-11 shrink-0 content-center rounded-lg px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring", x.active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent")}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
}
