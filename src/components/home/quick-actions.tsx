"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileUp, Plus, Search, Wallet } from "lucide-react";
import { OPEN_COMMAND_PALETTE } from "@/components/layout/command-palette";

/**
 * The four things people do after looking at the number: log something, bring in a statement,
 * look at the budget, or find a transaction. One tap each, from the top of Home.
 */
export function QuickActions() {
  const t = useTranslations("home.quick");
  // Four tiles on a phone (they all fit at once), four pills once there is room for a row.
  return (
    <nav aria-label={t("label")} className="grid grid-cols-4 gap-2 sm:flex">
      <Link href="/transactions?add=1" className="quick-chip press">
        <Plus className="size-4" aria-hidden />
        {t("add")}
      </Link>
      <Link href="/settings/bank?mode=manual" className="quick-chip press">
        <FileUp className="size-4" aria-hidden />
        {t("import")}
      </Link>
      <Link href="/budget" className="quick-chip press">
        <Wallet className="size-4" aria-hidden />
        {t("budget")}
      </Link>
      <button type="button" className="quick-chip press" onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}>
        <Search className="size-4" aria-hidden />
        {t("search")}
      </button>
    </nav>
  );
}
