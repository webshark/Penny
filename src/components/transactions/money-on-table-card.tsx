"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, HandCoins } from "lucide-react";
import { getAssets, getInsurance, getSavingsDone, getSuggestions, setSavingDone } from "@/lib/api";
import { moneyOnTable } from "@/lib/money-on-table";
import { shekels } from "@/lib/money";
import { CardError } from "@/components/home/card-shell";

/**
 * The money-on-the-table list from queries every page already caches. "loading" until every source answered,
 * "error" when the core ones failed; `partial` when funds or insurance couldn't load, so the total may be low.
 */
export function useMoneyOnTable() {
  const sug = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions });
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const ins = useQuery({ queryKey: ["insurance"], queryFn: getInsurance });
  const done = useQuery({ queryKey: ["savings-done"], queryFn: getSavingsDone });
  if (sug.isError || done.isError) return "error" as const;
  if (!sug.data || !done.data || assets.isPending || ins.isPending) return "loading" as const;
  return {
    ...moneyOnTable({
      suggestions: sug.data.suggestions,
      assets: (assets.data?.assets ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type, valueIls: a.valueIls, monthlyDeposit: a.monthlyDeposit, feeDeposit: a.feeDeposit, feeBalance: a.feeBalance })),
      policies: ins.data?.policies ?? [],
      done: done.data.done,
      donations: sug.data.donations,
    }),
    partial: assets.isError || ins.isError,
  };
}

/** Every check that found money, as one yearly figure: the step that gets each part, and what was already saved. */
export function MoneyOnTableCard({ limit }: { limit?: number } = {}) {
  const t = useTranslations("moneyOnTable");
  const locale = useLocale();
  const qc = useQueryClient();
  const table = useMoneyOnTable();
  const mark = useMutation({
    mutationFn: (v: { key: string; yearly: number }) => setSavingDone(v.key, v.yearly, true),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ["savings-done"] });
      toast.success(t("doneToast"), {
        action: { label: t("undo"), onClick: () => void setSavingDone(v.key, v.yearly, false).then(() => qc.invalidateQueries({ queryKey: ["savings-done"] }), () => toast.error(t("failed"))) },
      });
    },
    onError: () => toast.error(t("failed")),
  });
  if (table === "loading") return null;
  if (table === "error") return <CardError label={t("title")} />;
  if (limit && table.items.length === 0) return null;
  const shown = limit ? table.items.slice(0, limit) : table.items;

  return (
    <section aria-labelledby="mot-title" className="rounded-2xl border border-border bg-card p-4">
      <h2 id="mot-title" className="flex items-center gap-2 text-base font-semibold"><HandCoins className="size-4 text-primary" aria-hidden />{t("title")}</h2>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{shekels(table.total, locale)}<span className="ms-2 text-sm font-normal text-muted-foreground">{t("perYear")}</span></p>
      {table.saved > 0 && <p className="mt-1 text-sm text-status-on-track">{t("saved", { amount: shekels(table.saved, locale) })}</p>}
      {table.items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {shown.map((i) => (
            <li key={i.key} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <p className="text-sm font-medium">{t(`${i.kind}.title`, { name: i.name ?? "" })}</p>
                <p className="text-sm text-muted-foreground text-pretty">{t(`${i.kind}.step`)}</p>
              </div>
              <span className="me-auto tabular-nums text-sm font-semibold sm:me-0">{i.yearly == null ? t("unknown") : shekels(i.yearly, locale)}</span>
              <Link href={i.href} aria-label={`${t("open")}: ${t(`${i.kind}.title`, { name: i.name ?? "" })}`} className="grid h-11 place-items-center rounded-lg px-3 text-sm text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t("open")}</Link>
              <button type="button" aria-label={`${t("done")}: ${t(`${i.kind}.title`, { name: i.name ?? "" })}`} disabled={mark.isPending} onClick={() => mark.mutate({ key: i.key, yearly: i.yearly ?? 0 })}
                className="flex h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <Check className="size-4" aria-hidden />{t("done")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {limit && table.items.length > limit && <Link href="/optimizations" className="mt-2 inline-flex h-11 items-center text-sm text-primary">{t("all", { n: table.items.length })}</Link>}
      {table.partial && <p className="mt-3 text-xs text-[var(--status-heads-up)]">{t("partial")}</p>}
      <p className="mt-3 text-xs text-muted-foreground">{t("disclaimer")}</p>
    </section>
  );
}
