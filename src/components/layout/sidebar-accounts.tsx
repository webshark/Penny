"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { compactShekels } from "@/lib/money";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Plus, Settings } from "lucide-react";
import { GROUP_ICON, TYPE_ICON } from "@/components/accounts/account-icons";
import { getAssets } from "@/lib/api";
import { accountLabel } from "@/lib/i18n-data";
import { ACCOUNT_GROUPS, groupAccounts, type AccountGroupKey } from "@/lib/account-groups";
import { loadPreference } from "@/lib/preference-sync";

const isGroup = (k: unknown): k is AccountGroupKey => (ACCOUNT_GROUPS as readonly unknown[]).includes(k);
export type SidebarAccountsPref = { hidden: AccountGroupKey[]; moves: Record<number, AccountGroupKey> };

/** The sidebar's account preferences (Settings > Appearance and > Account groups). Unknown values are dropped. */
export function useSidebarAccountsPref(): SidebarAccountsPref {
  const q = useQuery({ queryKey: ["preference", "sidebar-accounts"], queryFn: () => loadPreference("sidebar-accounts") });
  const raw = (q.data ?? {}) as { hidden?: unknown; moves?: unknown };
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter(isGroup) : [];
  const moves = Object.fromEntries(Object.entries(raw.moves && typeof raw.moves === "object" ? raw.moves : {}).filter(([id, g]) => /^\d+$/.test(id) && isGroup(g))) as Record<number, AccountGroupKey>;
  return { hidden, moves };
}

export const useHiddenAccountGroups = () => useSidebarAccountsPref().hidden;


/** Account tree: each group with its total, opened to show every account's balance. */
export function SidebarAccounts({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("accountsView");
  const locale = useLocale();
  const { data } = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const compact = (n: number) => compactShekels(n, locale);
  const { hidden, moves } = useSidebarAccountsPref();
  const tBanks = useTranslations("banks");
  const groups = groupAccounts((data?.assets ?? []).map((a) => ({ ...a, name: accountLabel(a, tBanks) })), moves).filter((g) => !hidden.includes(g.key));
  return (
    <section aria-labelledby="sidebar-accounts" className="mt-3 border-t border-sidebar-border px-2 pt-3 group-data-[collapsible=icon]:hidden">
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 id="sidebar-accounts" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("title")}</h2>
        <div className="flex items-center">
        <Link href="/settings/account-groups" onClick={onNavigate} aria-label={t("manageGroups")} title={t("manageGroups")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"><Settings className="size-4" aria-hidden /></Link>
        <Link href="/investments" onClick={onNavigate} aria-label={t("add")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-4" aria-hidden /></Link>
        </div>
      </div>
      {/* "No accounts yet" only once the list has loaded: while loading or after a failed fetch it would be untrue. */}
      {!data ? null : groups.length === 0 ? <Link href="/accounts" onClick={onNavigate} className="block rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent">{t("empty")}</Link> :
        groups.map((g) => (
          // Open by default: each group's name and total, then its accounts.
          <details key={g.key} open className="group/acc">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform -rotate-90 rtl:rotate-90 group-open/acc:rotate-0 motion-reduce:transition-none" aria-hidden />
              {(() => { const Icon = GROUP_ICON[g.key]; return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />; })()}
              <span className="min-w-0 flex-1 truncate font-medium">{t(`groups.${g.key}`)}</span>
              <bdi data-money className={`shrink-0 text-xs font-medium tabular-nums ${g.total < 0 ? "text-expense" : ""}`}>{compact(g.total)}</bdi>
            </summary>
            <ul className="mb-1">
              {g.items.map((a) => (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}`} onClick={onNavigate} className="flex min-h-8 items-center gap-2 rounded-md ps-8 pe-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    {(() => { const Icon = TYPE_ICON[a.type]; return <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />; })()}
                    <span className="flex-1 truncate" title={a.name}>{a.name}</span>
                    <bdi data-money className={`tabular-nums ${a.value < 0 ? "text-expense" : ""}`}>{compact(a.value)}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
    </section>
  );
}
