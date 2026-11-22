"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NAVIGATION_GROUPS } from "@/components/layout/navigation-groups";

// Reports first, then the tools that answer a question.
const TOOLS = new Set(["ask", "calculators", "learn"]);

/** The analytics hub's menu: a card beside every analytics page, like the settings menu. */
export function AnalyticsNav() {
  const pathname = usePathname();
  const t = useTranslations("navGroups");
  const tHub = useTranslations("analyticsHub");
  const items = NAVIGATION_GROUPS.find((g) => g.key === "analytics")!.items;
  const sections = [
    { key: "reports", items: items.filter((i) => !TOOLS.has(i.key)) },
    { key: "tools", items: items.filter((i) => TOOLS.has(i.key)) },
  ];
  return (
    <nav aria-label={t("groups.analytics")} className="sticky top-20 hidden w-56 shrink-0 self-start rounded-2xl border border-border bg-card p-2 shadow-sm md:block">
      {sections.map((s, n) => (
        <div key={s.key} className={n ? "mt-2 border-t border-border pt-2" : ""}>
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tHub(s.key)}</p>
          <ul className="flex flex-col gap-0.5">
            {s.items.map((i) => {
              const active = i.match(pathname);
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={active ? "page" : undefined}
                    className={cn("flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-footnote transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-accent hover:text-foreground")}>
                    <i.Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{t(`pages.${i.key}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
