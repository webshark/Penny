"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FileUp, Landmark, Plus, Search, Settings as SettingsIcon, WalletCards } from "lucide-react";
import { SyncButton } from "@/components/dashboard/sync-button";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CommandPalette, OPEN_INLINE_SEARCH } from "./command-palette";
import { NotificationsBell } from "./notifications-bell";
import { cn } from "@/lib/utils";

/** The row above every page on wide screens: add a transaction (and its siblings) on the start; sync, alerts and settings on the end. */
export function TopBar() {
  const t = useTranslations("topBar");
  const tShell = useTranslations("shell");
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); router.push("/transactions?add=1"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const open = () => setSearching(true);
    window.addEventListener(OPEN_INLINE_SEARCH, open);
    return () => window.removeEventListener(OPEN_INLINE_SEARCH, open);
  }, []);
  const icon = cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-xl");

  return (
    <div className="hidden md:block">
      {/* Every action in one cluster at the end of the bar: search, add, then sync, alerts and settings. */}
      <div className="mx-auto flex min-h-14 max-w-[1920px] items-center justify-end gap-2 px-6 pt-3 lg:px-8">
        {/* Search: an icon that widens in place into the live search (Ctrl K or / too); its results open below. */}
        <div data-search-root className={cn("relative flex h-10 items-center rounded-xl border bg-card transition-[width,border-color] duration-300 ease-[var(--ease-soft)] motion-reduce:transition-none", searching ? "w-[26rem] border-primary/50 px-1.5" : "w-10 border-border")}>
          {searching ? <CommandPalette placeholder={t("search")} onClose={() => setSearching(false)} dropDown /> : (
            <button type="button" onClick={() => setSearching(true)} aria-label={t("search")} title={`${t("search")} (Ctrl K)`} aria-keyshortcuts="Control+K Meta+K /"
              className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <Search className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {/* One +: add a transaction, or bring money in some other way. N still adds a transaction directly. */}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("addMenu")} title={t("addMenu")} aria-keyshortcuts="N" className={cn(buttonVariants({ size: "icon" }), "rounded-xl shadow-sm")}>
            <Plus className="size-5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56 bg-popover">
            <DropdownMenuItem onClick={() => router.push("/transactions?add=1")}><Plus className="size-4" aria-hidden /><span className="flex-1">{tShell("addTransaction")}</span><kbd dir="ltr" className="text-[11px] text-muted-foreground">N</kbd></DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/data")}><FileUp className="size-4" aria-hidden />{t("importFile")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/bank")}><Landmark className="size-4" aria-hidden />{t("connectBank")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/investments")}><WalletCards className="size-4" aria-hidden />{t("addAccount")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SyncButton onComplete={() => queryClient.invalidateQueries()} showLabel={false} />
        {/* The bell is for what happened; advice and alerts live with Pip in the side rail. */}
        <NotificationsBell />
        <Link href="/settings" aria-label={t("settings")} title={t("settings")} className={icon}>
          <SettingsIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
