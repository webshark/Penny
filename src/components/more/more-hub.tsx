"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MoreHero } from "@/components/ui/page-hero";
import { SuggestionsCard } from "@/components/home/suggestions-card";
import { CalculatorTiles, NavRow, groupedList } from "@/components/more/calculators";
import { BookOpen, Briefcase, Calculator, CalendarClock, ChevronLeft, ClipboardCheck, LayoutDashboard, Compass, FileHeart, FileUp, HandHeart, HeartPulse, LifeBuoy, MessageCircleQuestion, Route, ShieldCheck, Sparkles } from "lucide-react";
import { DailyTip } from "@/components/tips/tips";

/** Everything that isn't daily, in one calm place: the menu stays short, nothing gets lost. */
const GROUPS = [
  { key: "rituals", items: [
    { href: "/reviews", key: "reviews", Icon: ClipboardCheck },
    { href: "/recap", key: "recap", Icon: Sparkles },
    { href: "/wellbeing", key: "wellbeing", Icon: HeartPulse },
  ] },
  { key: "explore", items: [
    { href: "/ask", key: "ask", Icon: MessageCircleQuestion },
    { href: "/planned", key: "planned", Icon: CalendarClock },
    { href: "/business", key: "business", Icon: Briefcase },
    { href: "/journey", key: "journey", Icon: Route },
    { href: "/life", key: "life", Icon: Compass },
    { href: "/calculators", key: "calculators", Icon: Calculator },
    { href: "/learn", key: "learn", Icon: BookOpen },
  ] },
  { key: "help", items: [
    { href: "/help", key: "help", Icon: LifeBuoy },
    { href: "/welcome", key: "welcome", Icon: HandHeart },
  ] },
  { key: "documents", items: [
    { href: "/insurance", key: "insurance", Icon: ShieldCheck },
    { href: "/settings/legacy", key: "legacy", Icon: FileHeart },
    { href: "/settings/bank#import", key: "import", Icon: FileUp },
  ] },
] as const;

const SHORTCUTS = [
  { href: "/recap", key: "recap", Icon: Sparkles },
  { href: "/calculators", key: "calculators", Icon: Calculator },
  { href: "/help", key: "help", Icon: LifeBuoy },
] as const;

export function MoreHub() {
  const t = useTranslations("moreHub");
  return (
    <div className="space-y-8">
      {/* On a wide screen the short hero and the control room sit side by side, so neither floats in empty space. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
      {/* The three places people come back to, as shortcuts inside the purple card. */}
      <MoreHero aside={
        <div className="grid w-full max-w-[15rem] gap-1.5">
          {SHORTCUTS.map(({ href, key, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 rounded-full bg-white/12 px-3 py-2 text-footnote font-medium transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-ring">
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t(`${key}_title`)}</span>
            </Link>
          ))}
        </div>
      } />
      {/* The control room and the tip of the day stack beside the hero, so no card stretches thin. */}
      <div className="grid content-start gap-4">
      <Link
        href="/control"
        className="flex items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-foreground/15" aria-hidden><LayoutDashboard className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-semibold opacity-80">{t("control_badge")}</span>
          <span className="block text-headline font-semibold">{t("control_title")}</span>
          <span className="mt-0.5 block text-footnote text-pretty opacity-85">{t("control_hint")}</span>
        </span>
        <ChevronLeft className="size-5 shrink-0 opacity-80 ltr:rotate-180" aria-hidden />
      </Link>
      <DailyTip />
      </div>
      </div>
      <CalculatorTiles />
      <SuggestionsCard limit={50} />
      <div className="grid gap-x-6 gap-y-6 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.key} aria-labelledby={`more-${g.key}`}>
            <h2 id={`more-${g.key}`} className="mb-2 px-1 text-footnote font-semibold text-muted-foreground">{t(`group_${g.key}`)}</h2>
            <ul className={groupedList}>
              {g.items.map(({ href, key, Icon }) => (
                <li key={href}><NavRow href={href} Icon={Icon} title={t(`${key}_title`)} hint={t(`${key}_hint`)} /></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
