"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Lock, Search, Settings as SettingsIcon } from "lucide-react";
import { getActivity, getHome } from "@/lib/api";
import { getLockStatus } from "@/components/settings/app-lock-card";
import { SyncStatusPill } from "@/components/home/sync-status-pill";
import { IconButton } from "@/components/ui/icon-button";
import { buttonVariants } from "@/components/ui/button";
import { A11yButton } from "@/components/a11y/a11y-menu";
import { usePrivacyMode } from "@/hooks/use-privacy-mode";
import { cn } from "@/lib/utils";
import { OPEN_COMMAND_PALETTE } from "./command-palette";
import { NAV } from "./app-sidebar";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** Simple mode on desktop: one quiet row instead of the side menu, with everything the menu offered. Phones keep the dock and the menu sheet. */
export function SimpleTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const tPrivacy = useTranslations("settings.privacy");
  const [privacyOn, togglePrivacy] = usePrivacyMode();
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });
  const { data: activity } = useQuery({ queryKey: ["activity"], queryFn: getActivity, refetchInterval: 15000, refetchIntervalInBackground: false });
  const lock = useQuery({ queryKey: ["lock"], queryFn: getLockStatus });
  const onSettings = pathname.startsWith("/settings");

  return (
    <div className="hidden border-b border-border/60 md:block">
      <div className="mx-auto flex min-h-14 max-w-[76rem] items-center gap-1 px-6 lg:px-8">
        <SyncStatusPill items={home.data?.bankHealth ?? null} nextScheduledSync={home.data?.nextScheduledSync ?? null} activity={activity ?? null} />
        <nav aria-label={t("mainNavigation")} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={t(item.labelKey)}
                className={cn(
                  "group inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  active && "bg-primary/10 font-semibold text-primary hover:bg-primary/10"
                )}
              >
                <item.Icon className="size-4" aria-hidden />
                {/* Icons only; the name opens on hover or keyboard focus (screen readers always get it). */}
                <span className="sr-only group-hover:not-sr-only group-focus-visible:not-sr-only">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
        <IconButton label={`${t("search")} (Ctrl K)`} size="icon" aria-keyshortcuts="Control+K Meta+K /" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}>
          <Search className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={privacyOn ? tPrivacy("modeOffAction") : tPrivacy("modeOnAction")} size="icon" aria-pressed={privacyOn} onClick={togglePrivacy}>
          {privacyOn ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </IconButton>
        {lock.data?.enabled && (
          <IconButton
            label={t("lockNow")}
            size="icon"
            onClick={async () => {
              await fetch("/api/lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lock" }) });
              router.replace("/lock");
            }}
          >
            <Lock className="size-4" aria-hidden />
          </IconButton>
        )}
        <A11yButton size="icon" />
        <Link href="/settings" aria-label={t("settings")} title={t("settings")} aria-current={onSettings ? "page" : undefined} className={buttonVariants({ variant: onSettings ? "secondary" : "ghost", size: "icon" })}>
          <SettingsIcon className="size-4" aria-hidden />
        </Link>
        <div className="max-w-48 shrink-0 empty:hidden">
          <WorkspaceSwitcher side="bottom" />
        </div>
      </div>
    </div>
  );
}
