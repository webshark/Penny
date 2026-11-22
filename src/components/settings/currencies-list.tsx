"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getCurrencies } from "@/lib/api";
import { SettingCard, SettingList, SettingRow } from "@/components/settings/section-shell";

/** Currencies: the base currency, then every currency in use with today's rate in shekels. */
export function CurrenciesList() {
  const t = useTranslations("settings.currencies");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["currencies"], queryFn: getCurrencies });
  const name = (code: string) => { try { return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code; } catch { return code; } };
  const rate = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", maximumFractionDigits: 4 }).format(n);
  const others = (q.data?.currencies ?? []).filter((c) => c.currency !== "ILS");
  return (
    <>
      <SettingCard title={t("baseTitle")} description={t("baseHint")}>
        <SettingList>
          <SettingRow label={`${name("ILS")} (ILS)`} hint={t("baseFixed")}><span className="text-lg font-semibold">₪</span></SettingRow>
        </SettingList>
      </SettingCard>
      <SettingCard title={t("listTitle", { n: others.length })} description={t("listHint")}>
        {q.isError ? <p role="alert" className="text-sm">{t("failed")}</p>
          : !q.data ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
          : others.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("onlyShekel")}</p>
          : <ul className="divide-y divide-border">
            {others.map((c) => {
              const up = (c.change30d ?? 0) >= 0;
              const Icon = up ? ArrowUp : ArrowDown;
              return (
                <li key={c.currency} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
                  <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">{c.currency}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name(c.currency)}</span>
                    <span className="block text-xs text-muted-foreground">{[c.transactions ? t("transactions", { n: c.transactions }) : null, c.assets ? t("assets", { n: c.assets }) : null].filter(Boolean).join(" · ")}</span></span>
                  {c.rate === null ? <span className="text-xs text-muted-foreground">{t("noRate")}</span> : <span className="text-end">
                    <bdi className="block text-sm font-semibold tabular-nums">1 {c.currency} = {rate(c.rate)}</bdi>
                    {c.change30d !== null && <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Icon className="size-3" aria-hidden /><bdi>{Math.abs(c.change30d * 100).toFixed(1)}%</bdi> {t("in30Days")}</span>}
                  </span>}
                </li>
              );
            })}
          </ul>}
      </SettingCard>
    </>
  );
}
