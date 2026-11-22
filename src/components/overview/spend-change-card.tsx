"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { CardShell, CardError } from "@/components/home/card-shell";
import { Segmented } from "@/components/ui/segmented";
import { getSpendChange } from "@/lib/api";
import { shekels } from "@/lib/money";

/** Why spending moved: this month so far against the same days last month (or last year), merchant by merchant. */
export function SpendChangeCard() {
  const t = useTranslations("spendChange");
  const locale = useLocale();
  const [compare, setCompare] = useState<"month" | "year">("month");
  const q = useQuery({ queryKey: ["spend-change", compare], queryFn: () => getSpendChange(compare) });
  if (q.isError) return <CardError label={t("title")} />;
  const d = q.data;
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: compare === "year" ? "numeric" : undefined }).format(new Date(`${iso}T12:00:00`));
  const up = (d?.change ?? 0) > 0;

  return (
    <CardShell label={t("title")} action={<Segmented label={t("compareLabel")} value={compare} onChange={setCompare} options={[{ value: "month", label: t("vsMonth") }, { value: "year", label: t("vsYear") }]} />}>
      {!d ? (
        <p className="text-sm text-muted-foreground" role="status">{t("loading")}</p>
      ) : !d.hasHistory ? (
        <p className="text-sm text-muted-foreground">{t(compare === "year" ? "noYear" : "noMonth")}</p>
      ) : (
        <>
          <p className="text-sm text-pretty">
            {t(d.change === 0 ? "same" : up ? "up" : "down", {
              amount: shekels(Math.abs(d.change), locale),
              now: `${fmtDay(d.now.from)}–${fmtDay(d.now.to)}`,
              before: `${fmtDay(d.before.from)}–${fmtDay(d.before.to)}`,
            })}
          </p>
          {d.drivers.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {d.drivers.map((x) => (
                <li key={`${x.merchant}-${x.kind}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium" title={x.merchant}>{x.merchant}</span>
                    <span className="block text-xs text-muted-foreground">{t(`kind_${x.kind}`)}</span>
                  </span>
                  <bdi className={`shrink-0 tabular-nums text-sm font-semibold ${x.amount > 0 ? "text-expense" : "text-status-on-track"}`} data-money>
                    {x.amount > 0 ? "+" : "−"}{shekels(Math.abs(x.amount), locale)}
                  </bdi>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </CardShell>
  );
}
