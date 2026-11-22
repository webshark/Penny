"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { getOwners, setAccountOwner } from "@/lib/api";
import type { HouseholdMember } from "@/lib/household";
import { shekels } from "@/lib/money";
import { SHARED } from "@/lib/tags";
import { OwnerPicker } from "./owner-picker";

/** This month by owner (mine / partner / shared) and a calm who-owes-whom line. Only for 2+ members. */
export function OwnerSummary({ members, from, to }: { members: HouseholdMember[]; from: string; to: string }) {
  const t = useTranslations("tags");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["owners", from, to], queryFn: () => getOwners(from, to) });
  if (!query.data) return null;
  const { summary, accounts, accountOwners } = query.data;
  const money = (n: number) => shekels(Math.round(n), locale);
  const nameOf = (id: string) => (id === SHARED ? t("shared") : members.find((m) => m.id === id)?.name ?? "");

  const setDefault = async (accountNumber: string, owner: string | null) => {
    try {
      await setAccountOwner(accountNumber, owner);
      void queryClient.invalidateQueries({ queryKey: ["owners"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"));
    }
  };

  return (
    <section aria-label={t("ownersTitle")} className="card-surface">
      <h2 className="card-title">{t("ownersTitle")}</h2>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {[...members.map((m) => m.id), SHARED].map((id) => (
          <div key={id}>
            <dt className="text-xs text-muted-foreground">{nameOf(id)}</dt>
            <dd className="text-lg font-semibold tabular-nums">{money(summary.byOwner[id] ?? 0)}</dd>
          </div>
        ))}
        {summary.unset > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("ownerUnset")}</dt>
            <dd className="text-lg tabular-nums text-muted-foreground">{money(summary.unset)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-sm leading-relaxed">
        {summary.settlements.length === 0
          ? t("settledEven")
          : summary.settlements.map((s) => t("settlement", { from: nameOf(s.from), to: nameOf(s.to), amount: money(s.amount) })).join(" · ")}
      </p>
      {accounts.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer rounded text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">{t("accountDefaults")}</summary>
          <ul className="mt-2 grid max-w-3xl gap-x-8 gap-y-2 lg:grid-cols-2">
            {accounts.map((a) => (
              <li key={a.accountNumber} className="flex items-center justify-between gap-3 text-sm">
                <span className="tabular-nums" dir="ltr">{a.label ?? a.provider} · {a.accountNumber.slice(-4)}</span>
                <OwnerPicker
                  label={t("accountOwnerLabel", { account: a.accountNumber.slice(-4) })}
                  value={accountOwners[a.accountNumber] ?? null}
                  members={members}
                  onChange={(owner) => void setDefault(a.accountNumber, owner)}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{t("accountDefaultsHint")}</p>
        </details>
      )}
    </section>
  );
}
