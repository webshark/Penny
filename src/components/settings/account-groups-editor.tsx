"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { getAssets } from "@/lib/api";
import { accountLabel } from "@/lib/i18n-data";
import { ACCOUNT_GROUPS, accountGroupOf, groupAccounts, type AccountGroupKey } from "@/lib/account-groups";
import { storePreference } from "@/lib/preference-sync";
import { shekels } from "@/lib/money";
import { useSidebarAccountsPref } from "@/components/layout/sidebar-accounts";
import { SettingCard } from "@/components/settings/section-shell";

/** Account groups: each account listed under its group, with a picker to move it to another. */
export function AccountGroupsEditor() {
  const t = useTranslations("settings.accountGroups");
  const tGroups = useTranslations("accountsView.groups");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const { hidden, moves } = useSidebarAccountsPref();
  const tBanks = useTranslations("banks");
  const assets = (q.data?.assets ?? []).map((a) => ({ ...a, name: accountLabel(a, tBanks) }));

  function move(id: number, to: AccountGroupKey, natural: AccountGroupKey) {
    const next = { ...moves };
    if (to === natural) delete next[id]; else next[id] = to;
    qc.setQueryData(["preference", "sidebar-accounts"], { hidden, moves: next });
    void storePreference("sidebar-accounts", { hidden, moves: next }).catch(() => toast.error(t("failed")));
  }

  if (q.isError) return <p role="alert" className="text-sm">{t("failed")}</p>;
  if (!q.data) return <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (assets.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <>
      {groupAccounts(assets, moves).map((g) => (
        <SettingCard key={g.key} title={`${tGroups(g.key)} · ${g.items.length}`}>
          <ul className="divide-y divide-border">
            {g.items.map((item) => {
              const asset = assets.find((a) => a.id === item.id)!;
              const natural = accountGroupOf(asset);
              return (
                <li key={item.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                  <bdi className={`text-sm tabular-nums ${item.value < 0 ? "text-expense" : ""}`} data-money>{shekels(Math.round(item.value), locale)}</bdi>
                  {/* A debt is always a debt, so only assets can move. */}
                  {!asset.isLiability && (
                    <select aria-label={t("moveLabel", { name: item.name })} value={g.key} onChange={(e) => move(item.id, e.target.value as AccountGroupKey, natural)}
                      className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
                      {ACCOUNT_GROUPS.filter((k) => k !== "liabilities").map((k) => <option key={k} value={k}>{tGroups(k)}{k === natural ? ` (${t("default")})` : ""}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </SettingCard>
      ))}
    </>
  );
}
