"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { getAssets } from "@/lib/api";
import { shekels } from "@/lib/money";
import { isVolatile } from "@/lib/holdings";
import { CardShell } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetDialog } from "@/components/investments/asset-dialog";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/types";

const pct = (n: number) => `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toFixed(1)}%`;

/** Holdings whose value moves with the market: stocks, funds (incl. money-market), bonds, crypto, metals. */
export function VolatileHoldings() {
  const t = useTranslations("holdings");
  const ti = useTranslations("investments");
  const locale = useLocale();
  const { data, isLoading, isError } = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  const list = (data?.assets ?? []).filter(isVolatile);
  const total = list.reduce((s, a) => s + (a.valueIls ?? 0), 0);
  const date = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(d));
  const signed = (n: number) => <span dir="ltr" className={n >= 0 ? "text-status-on-track" : "text-destructive"}>{n >= 0 ? "+" : ""}{shekels(n, locale)}</span>;

  return (
    <CardShell
      label={t("title")}
      className="lg:col-span-3"
      action={<Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden />{t("add")}</Button>}
    >
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : isError ? (
        <p className="text-footnote text-destructive">{t("loadFailed")}</p>
      ) : list.length === 0 ? (
        <p className="text-footnote text-pretty text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="figure text-3xl">{shekels(total, locale)}</p>
            <span className="rounded-full bg-status-heads-up/15 px-2 py-0.5 text-caption font-medium text-status-heads-up">{t("volatile")}</span>
          </div>
          <p className="mb-3 text-caption text-pretty text-muted-foreground">{t("note")}</p>
          <ul className="row-grid">
            {list.map((a) => {
              const c = a.change;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => setEditing(a)} className="flex min-h-11 w-full items-start justify-between gap-3 py-2.5 text-start">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.name}</span>
                      <span className="block text-caption text-muted-foreground">
                        {ti(`type_${a.type}`)}
                        {a.symbol && <> · <span dir="ltr">{a.quantity} × {a.symbol}</span></>}
                        {" · "}
                        {a.quote
                          ? t(a.quote.stale ? "priceStale" : "priceLive", { date: date(a.quote.asOf) })
                          : t("manual", { date: c?.since ? date(c.since) : t("today") })}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block font-medium tabular-nums">{a.valueIls == null ? "—" : shekels(a.valueIls, locale)}</span>
                      <span className="block text-caption tabular-nums">
                        {c?.changeIls != null && c.changePct != null && (
                          <span title={t("sinceLast")}>{signed(c.changeIls)} <span dir="ltr" className={cn(c.changePct >= 0 ? "text-status-on-track" : "text-destructive")}>{pct(c.changePct)}</span></span>
                        )}
                        {a.gainIls != null && <span className="ms-2 text-muted-foreground">{t("sinceBuy")} {signed(a.gainIls)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {editing && <AssetDialog asset={editing} preset={editing === "new" ? { type: "stock" } : undefined} onClose={() => setEditing(null)} />}
    </CardShell>
  );
}
