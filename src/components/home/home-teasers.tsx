"use client";

import { Forward } from "@/components/ui/dir-chevron";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getOwners } from "@/lib/api";
import { useHousehold } from "@/hooks/use-household";
import { homeTeasers, type HomeTeaser } from "@/lib/home-layout";
import { shouldShowWelcome } from "@/lib/household";
import { usePlan } from "@/hooks/use-plan";

const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const today = () => new Date().toISOString().slice(0, 10);
const ils = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

const card =
  "flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-5 py-4 transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Calm "let's get to know you" invite on first run; never blocks Home. Reopen any time from More or Help.
 * `pip` is the small bubble that lives with the pet on Home, instead of a card dropped into the page.
 */
export function WelcomePrompt({ variant = "card" }: { variant?: "card" | "pip" }) {
  const t = useTranslations("welcome");
  const tc = useTranslations("common");
  const { household, loading, save } = useHousehold();
  const { plan, loaded, update } = usePlan();
  if (loading || !loaded || plan.profile.onboarded || !shouldShowWelcome(household)) return null;
  const dismiss = () => { save({ welcomeDismissed: true }); void update({ profile: { ...plan.profile, onboarded: true } }).catch(() => toast.error(tc("saveFailed"))); };
  if (variant === "pip") {
    return (
      <Link
        href="/welcome"
        className="mt-1 block max-w-28 rounded-2xl rounded-bl-sm border border-border/60 bg-card/95 px-2 py-1 text-center shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="line-clamp-2 block text-[11px] font-medium leading-tight">{t("prompt")}</span>
      </Link>
    );
  }
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl border border-border/60 bg-card p-2 md:mb-5">
      <Link href="/welcome" className="min-w-0 flex-1 rounded-xl px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <span className="block text-footnote font-medium">{t("prompt")}</span>
        <span className="block text-footnote text-muted-foreground">{t("promptHint")}</span>
      </Link>
      <button
        type="button"
        aria-label={t("dismiss")}
        onClick={dismiss}
        className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Up to two small profile-driven teasers. */
export function HomeTeasers() {
  const t = useTranslations("journey.teaser");
  const { household } = useHousehold();
  const needsOwners = household.members.some((m) => m.role !== "me");
  const owners = useQuery({
    queryKey: ["owners", monthStart(), today()],
    queryFn: () => getOwners(monthStart(), today()),
    enabled: needsOwners,
  });
  const summary = owners.data?.summary;
  const kids = household.members.filter((m) => m.role === "child");
  const kidSpend = kids.map((k) => ({ name: k.name, spent: summary?.byOwner[k.id] ?? 0 })).filter((k) => k.spent > 0);
  const settle = summary?.settlements[0];
  const name = (id: string) => household.members.find((m) => m.id === id)?.name ?? id;

  const teasers = homeTeasers(household, { childSpend: kidSpend.length > 0, settleUp: !!settle });
  if (teasers.length === 0) return null;

  const content: Record<HomeTeaser, { href: string; title: string; body: string }> = {
    taxSetAside: { href: "/fi", title: t("taxTitle"), body: t("taxBody") },
    childSpend: {
      href: "/transactions",
      title: t("childTitle"),
      body: kidSpend.map((k) => t("childLine", { name: k.name, amount: ils(k.spent) })).join(" · "),
    },
    settleUp: {
      href: "/transactions",
      title: t("settleTitle"),
      body: settle ? t("settleBody", { from: name(settle.from), to: name(settle.to), amount: ils(settle.amount) }) : "",
    },
    freeToSpend: { href: "/budget", title: t("freeTitle"), body: t("freeBody") },
  };

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 md:mb-5">
      {teasers.map((k) => (
        <Link key={k} href={content[k].href} className={card}>
          <span className="min-w-0">
            <span className="block text-footnote font-medium">{content[k].title}</span>
            <span className="block text-footnote text-muted-foreground">{content[k].body}</span>
          </span>
          <Forward className="text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
